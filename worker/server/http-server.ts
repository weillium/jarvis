import http from 'http';
import { URL } from 'url';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Orchestrator } from '../runtime/orchestrator';
import { getBlueprintPromptPreview } from '../context/pipeline/blueprint-generator';

interface WorkerServerDeps {
  orchestrator: Orchestrator;
  workerPort: number;
  log: (...args: unknown[]) => void;
  supabase: SupabaseClient;
}

const safeParseJson = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const parseJsonBody = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    if (chunk instanceof Buffer) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(String(chunk)));
    }

    const totalLength = chunks.reduce((sum, current) => sum + current.length, 0);
    if (totalLength > 1_000_000) {
      throw new Error('Payload too large');
    }
  }

  if (chunks.length === 0) {
    return {};
  }

  const combined = Buffer.concat(chunks).toString();
  const parsed = safeParseJson<Record<string, unknown>>(combined);
  if (!parsed) {
    throw new Error('Invalid JSON payload');
  }
  return parsed;
};

export const createWorkerServer = ({
  orchestrator,
  workerPort,
  log,
  supabase,
}: WorkerServerDeps): http.Server => {
  const server = http.createServer((req, res) => {
    void (async () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (pathname === '/health' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, status: 'healthy' }));
        return;
      }

      if (pathname === '/sessions/create' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const rawEventId = body.event_id ?? body.eventId;
          const eventId = typeof rawEventId === 'string' ? rawEventId : null;

          if (!eventId) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'event_id is required' }));
            return;
          }

          const result = await orchestrator.createAgentSessionsForEvent(eventId);

          res.writeHead(200);
          res.end(
            JSON.stringify({
              ok: true,
              event_id: eventId,
              agent_id: result.agentId,
              model_set: result.modelSet,
              sessions: result.sessions.map((session) => ({
                id: session.id,
                agent_type: session.agent_type,
                status: session.status,
                transport: session.transport,
                model: session.model,
              })),
            })
          );
          return;
        } catch (err: unknown) {
          console.error('[worker] error:', String(err));
        }
      }

      if (pathname === '/sessions/reset' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const rawEventId = body.event_id ?? body.eventId;
          const eventId = typeof rawEventId === 'string' ? rawEventId : null;

          if (!eventId) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'event_id is required' }));
            return;
          }

          await orchestrator.resetEventRuntime(eventId);

          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, event_id: eventId }));
          return;
        } catch (err: unknown) {
          console.error('[worker] error:', String(err));
        }
      }

      if (pathname === '/sessions/transcript/audio' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const rawEventId = body.event_id ?? body.eventId;
          const eventId = typeof rawEventId === 'string' ? rawEventId : null;

          if (!eventId) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'event_id is required' }));
            return;
          }

          const rawAudio = body.audio_base64 ?? body.audioBase64;
          const audioBase64 = typeof rawAudio === 'string' ? rawAudio : null;

          if (!audioBase64) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'audio_base64 is required' }));
            return;
          }

          const chunkMetadata = {
            audioBase64,
            seq: typeof body.seq === 'number' ? body.seq : undefined,
            isFinal:
              typeof body.is_final === 'boolean'
                ? body.is_final
                : typeof body.isFinal === 'boolean'
                ? body.isFinal
                : undefined,
            sampleRate:
              typeof body.sample_rate === 'number'
                ? body.sample_rate
                : typeof body.sampleRate === 'number'
                ? body.sampleRate
                : undefined,
            bytesPerSample:
              typeof body.bytes_per_sample === 'number'
                ? body.bytes_per_sample
                : typeof body.bytesPerSample === 'number'
                ? body.bytesPerSample
                : undefined,
            encoding: typeof body.encoding === 'string' ? body.encoding : undefined,
            durationMs:
              typeof body.duration_ms === 'number'
                ? body.duration_ms
                : typeof body.durationMs === 'number'
                ? body.durationMs
                : undefined,
            speaker: typeof body.speaker === 'string' ? body.speaker : undefined,
          } as const;

          try {
            await orchestrator.appendTranscriptAudio(eventId, chunkMetadata);

            res.writeHead(202);
            res.end(JSON.stringify({ ok: true }));
            return;
          } catch (err: unknown) {
            console.error('[worker] error:', String(err));
          }
        } catch (err: unknown) {
          console.error('[worker] error:', String(err));
        }
      }

      if (pathname === '/websocket-state' && req.method === 'GET') {
        const eventId = url.searchParams.get('event_id');

        if (!eventId) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'Missing event_id parameter' }));
          return;
        }

        const runtime = orchestrator.getRuntime(eventId);

        if (!runtime) {
          res.writeHead(200);
          res.end(
            JSON.stringify({
              ok: true,
              event_id: eventId,
              runtime_exists: false,
              sessions: [],
            })
          );
          return;
        }

        const sessions: Array<Record<string, unknown>> = [];

        if (runtime.cardsSession) {
          const cardsStatus = runtime.cardsSession.getStatus();
          sessions.push({
            agent_type: 'cards',
            websocket_state:
              cardsStatus.websocketState || (cardsStatus.isActive ? 'OPEN' : 'CLOSED'),
            is_active: cardsStatus.isActive,
            queue_length: cardsStatus.queueLength,
            session_id: cardsStatus.sessionId || runtime.cardsSessionId,
            connection_url: cardsStatus.connectionUrl || 'Not available',
            connected_at: cardsStatus.connectedAt || null,
            connection_info: {
              provider: 'OpenAI Realtime API',
              endpoint: cardsStatus.connectionUrl ? new URL(cardsStatus.connectionUrl).origin : 'Unknown',
              path: cardsStatus.connectionUrl ? new URL(cardsStatus.connectionUrl).pathname : 'Unknown',
            },
            ping_pong: cardsStatus.pingPong,
          });
        }

        if (runtime.factsSession) {
          const factsStatus = runtime.factsSession.getStatus();
          sessions.push({
            agent_type: 'facts',
            websocket_state:
              factsStatus.websocketState || (factsStatus.isActive ? 'OPEN' : 'CLOSED'),
            is_active: factsStatus.isActive,
            queue_length: factsStatus.queueLength,
            session_id: factsStatus.sessionId || runtime.factsSessionId,
            connection_url: factsStatus.connectionUrl || 'Not available',
            connected_at: factsStatus.connectedAt || null,
            connection_info: {
              provider: 'OpenAI Realtime API',
              endpoint: factsStatus.connectionUrl ? new URL(factsStatus.connectionUrl).origin : 'Unknown',
              path: factsStatus.connectionUrl ? new URL(factsStatus.connectionUrl).pathname : 'Unknown',
            },
            ping_pong: factsStatus.pingPong,
          });
        }

        res.writeHead(200);
        res.end(
          JSON.stringify({
            ok: true,
            event_id: eventId,
            runtime_exists: true,
            runtime_status: runtime.status,
            sessions,
          })
        );
        return;
      }

      if (pathname === '/blueprint/prompt' && req.method === 'GET') {
        const eventId = url.searchParams.get('event_id');

        if (!eventId) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'Missing event_id parameter' }));
          return;
        }

        try {
          const preview = await getBlueprintPromptPreview(eventId, { supabase });
          res.writeHead(200);
          res.end(
            JSON.stringify({
              ok: true,
              prompt: {
                system: preview.systemPrompt,
                user: preview.userPrompt,
              },
              event: preview.event,
            })
          );
          return;
        } catch (err: unknown) {
          const errorText = String(err);
          console.error('[worker] error:', errorText);
          const status = errorText.includes('Event not found') ? 404 : 500;
          res.writeHead(status);
          res.end(JSON.stringify({ ok: false, error: errorText }));
          return;
        }
      }

      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    } catch (err: unknown) {
      console.error('[worker] error:', String(err));
    }
    })().catch((err: unknown) => {
      console.error('[worker] Unhandled request error:', String(err));
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
      } else {
        res.end();
      }
    });
  });

  server.listen(workerPort, () => {
    log(`[worker-server] HTTP server listening on port ${workerPort}`);
    log('[worker-server] Endpoints:');
    log('[worker-server]   GET /health - Health check');
    log('[worker-server]   GET /websocket-state?event_id=<eventId> - Get WebSocket connection state');
    log('[worker-server]   GET /blueprint/prompt?event_id=<eventId> - Get blueprint prompt preview');
    log('[worker-server]   POST /sessions/create - Create agent sessions for an event');
    log('[worker-server]   POST /sessions/reset - Reset runtime state for an event');
    log('[worker-server]   POST /sessions/transcript/audio - Append transcript audio for an event');
  });

  return server;
};
