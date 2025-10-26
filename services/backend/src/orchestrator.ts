import type { Server, Socket } from 'socket.io';
import pino from 'pino';
import { performance } from 'node:perf_hooks';
import { sqlSearch } from './services/sqlSearch';
import { vecSearch } from './services/vecSearch';
import { webRag, sanitizeSnippets } from './services/webRag';
import { callTogether } from './services/llmAdapter.together';
import { validateCards } from './services/validator';
import { computeRetrievalScore } from './services/retrieval';
import { metrics } from './services/metrics';
import { recordHistory } from './routes';

const log = pino({ name: 'orchestrator' });

interface TranscriptFrame {
  event_id: string;
  t_start_ms: number;
  t_end_ms: number;
  text: string;
  speaker?: string;
}

const rollingWindows = new Map<string, string[]>();
const MAX_WINDOW_SIZE = 20;

export function createOrchestrator(io: Server) {
  const cardsNs = io.of('/ws/cards');

  async function onTranscriptFrame(frame: TranscriptFrame, _socket: Socket) {
    if (!frame?.event_id || !frame.text) {
      log.warn({ frame }, 'invalid transcript frame payload');
      return;
    }
    const start = performance.now();
    const eventId = frame.event_id;
    const window = updateWindow(eventId, frame.text);

    const sqlResult = sqlSearch(eventId, frame.text, 5);
    const vecResult = vecSearch(eventId, frame.text, 5);
    const retrievalScore = computeRetrievalScore({ sql: sqlResult.hits, vec: vecResult.hits, web: [] });

    let webResult = { snippets: [], latencyMs: 0, error: 'skipped' };
    if (retrievalScore.shouldTryWeb) {
      webResult = await webRag(frame.text, 3);
      if (webResult.snippets.length > 0) {
        metrics.retrievalMix.inc({ source: 'web' }, webResult.snippets.length);
      }
    }

    const pack = {
      event_id: eventId,
      transcript_window: window,
      frame,
      retrieval: {
        sql: sqlResult.hits,
        vec: vecResult.hits,
        web: sanitizeSnippets(webResult.snippets)
      },
      retrieval_score: retrievalScore
    };

    let llmOutput: { cards?: unknown[] } = {};
    try {
      llmOutput = await callTogether(pack);
    } catch (err) {
      log.error({ err, eventId }, 'llm call failed');
      metrics.latencyEnd.observe(performance.now() - start);
      return;
    }

    const { valid, invalid } = validateCards<any>(llmOutput.cards ?? []);
    if (invalid.length > 0) {
      metrics.cardsSuppressed.inc(invalid.length);
    }

    if (valid.length === 0) {
      log.info({ eventId }, 'no valid cards generated');
      metrics.latencyEnd.observe(performance.now() - start);
      return;
    }

    recordHistory(eventId, valid);
    metrics.cardsEmitted.inc(valid.length);

    const payload = {
      event_id: eventId,
      cards: valid,
      ts: Date.now()
    };
    cardsNs.emit('message', JSON.stringify(payload));
    metrics.latencyEnd.observe(performance.now() - start);
  }

  return { onTranscriptFrame };
}

function updateWindow(eventId: string, text: string): string[] {
  const window = rollingWindows.get(eventId) ?? [];
  window.push(text);
  if (window.length > MAX_WINDOW_SIZE) {
    window.splice(0, window.length - MAX_WINDOW_SIZE);
  }
  rollingWindows.set(eventId, window);
  return window.slice(-5);
}
