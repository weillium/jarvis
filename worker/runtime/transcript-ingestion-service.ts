import type { RuntimeService } from './runtime-service';
import type { SessionLifecycle } from './session-lifecycle';
import type { EventProcessor } from './event-processor';
import type { EventRuntime } from '../types';
import type { TranscriptsRepository } from '../services/supabase/transcripts-repository';
import type { TranscriptRecord } from '../types';
import type { MetricsCollector } from '../services/observability/metrics-collector';
import type { Logger } from '../services/observability/logger';
import type { StatusUpdater } from '../services/observability/status-updater';
import type { RealtimeTranscriptionUsageDTO } from '../types';
import { checkBudgetStatus, formatTokenBreakdown } from '../lib/text/token-counter';

export interface TranscriptAudioChunk {
  audioBase64: string;
  seq?: number;
  isFinal?: boolean;
  sampleRate?: number;
  bytesPerSample?: number;
  encoding?: string;
  durationMs?: number;
  speaker?: string;
}

export class TranscriptIngestionService {
  constructor(
    private readonly runtimeService: RuntimeService,
    private readonly sessionLifecycle: SessionLifecycle,
    private readonly transcriptsRepository: TranscriptsRepository,
    private readonly eventProcessor: EventProcessor,
    private readonly metrics: MetricsCollector,
    private readonly logger: Logger,
    private readonly statusUpdater: StatusUpdater
  ) {}

  async appendAudio(eventId: string, chunk: TranscriptAudioChunk): Promise<EventRuntime> {
    const runtime = await this.runtimeService.ensureRuntime(eventId);
    const enabledAgents = runtime.enabledAgents;

    if (!enabledAgents.transcript) {
      throw new Error(`Transcript agent disabled for event ${eventId}`);
    }

    const sessionWasJustCreated = !runtime.transcriptSession;
    
    if (sessionWasJustCreated) {
      this.logger.log(eventId, 'transcript', 'log', `Creating transcript session on-demand for audio ingestion, seq=${chunk.seq}`);
      await this.sessionLifecycle.createRealtimeSessions({
        runtime,
        eventId,
        agentId: runtime.agentId,
        enabledAgents,
      });
    }

    if (!runtime.transcriptSession) {
      throw new Error(`Transcript session unavailable for event ${eventId}`);
    }

    // Ensure session is connected if it exists but isn't connected yet
    // Audio chunks will be buffered until connection is ready
    if (!runtime.transcriptSessionId) {
      try {
        this.logger.log(eventId, 'transcript', 'log', `Connecting existing transcript session for audio ingestion, seq=${chunk.seq}`);
        const { transcriptSessionId } = await this.sessionLifecycle.connectSessions(
          runtime,
          eventId,
          enabledAgents
        );
        if (transcriptSessionId) {
          runtime.transcriptSessionId = transcriptSessionId;
          this.logger.log(eventId, 'transcript', 'log', `Transcript session connected for audio ingestion, sessionId=${transcriptSessionId}`);
        }
      } catch (err: unknown) {
        // Log but don't throw - audio will be buffered until connection succeeds
        this.logger.log(eventId, 'transcript', 'warn', `Failed to connect transcript session: ${String(err)}. Audio will be buffered.`);
      }
    }

    const audioSize = chunk.audioBase64 ? Math.round((chunk.audioBase64.length * 3) / 4) : 0;
    // this.logger.log(eventId, 'transcript', 'log', `Appending audio chunk seq=${chunk.seq}, size=${audioSize} bytes, sessionId=${runtime.transcriptSessionId || 'none'}`);
    
    try {
      await this.sessionLifecycle.appendTranscriptAudio(runtime, {
        audioBase64: chunk.audioBase64,
        isFinal: chunk.isFinal,
        sampleRate: chunk.sampleRate,
        bytesPerSample: chunk.bytesPerSample,
        encoding: chunk.encoding,
        durationMs: chunk.durationMs,
        speaker: chunk.speaker,
      });
      // this.logger.log(eventId, 'transcript', 'log', `Audio chunk seq=${chunk.seq} successfully appended to session lifecycle`);
    } catch (err: unknown) {
      this.logger.log(eventId, 'transcript', 'error', `Failed to append audio chunk seq=${chunk.seq}: ${String(err)}`);
      throw err;
    }

    runtime.pendingTranscriptChunk = {
      speaker: chunk.speaker ?? null,
      sampleRate: chunk.sampleRate,
      bytesPerSample: chunk.bytesPerSample,
      encoding: chunk.encoding,
      durationMs: chunk.durationMs,
    };

    return runtime;
  }

  async handleRealtimeTranscript(
    eventId: string,
    agentId: string,
    runtime: EventRuntime,
    payload: {
      text: string;
      isFinal?: boolean;
      receivedAt?: string;
      usage?: RealtimeTranscriptionUsageDTO;
    }
  ): Promise<void> {
    const text = payload.text?.trim();
    if (!text) {
      return;
    }

    const final = payload.isFinal === true;
    const atMs = payload.receivedAt ? Date.parse(payload.receivedAt) || Date.now() : Date.now();
    const speaker = runtime.pendingTranscriptChunk?.speaker ?? null;

    if (!final) {
      const seq = runtime.streamingTranscript?.seq ?? runtime.transcriptLastSeq + 1;

      runtime.streamingTranscript = {
        seq,
        speaker,
      };

      runtime.ringBuffer.add({
        seq,
        at_ms: atMs,
        speaker: speaker ?? undefined,
        text,
        final: false,
      });

      return;
    }

    const seq = runtime.streamingTranscript?.seq ?? runtime.transcriptLastSeq + 1;
    const usage = payload.usage;

    const record = await this.transcriptsRepository.insertTranscript({
      event_id: eventId,
      seq,
      text,
      at_ms: atMs,
      final: true,
      speaker,
    });

    this.recordTranscriptUsage(runtime, seq, usage);

    runtime.pendingTranscriptChunk = undefined;
    runtime.streamingTranscript = undefined;

    runtime.ringBuffer.add({
      seq,
      at_ms: atMs,
      speaker: speaker ?? undefined,
      text,
      final: true,
      transcript_id: record.id,
    });

    runtime.transcriptLastSeq = seq;
    runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, seq);
    runtime.factsLastSeq = Math.max(runtime.factsLastSeq, seq);

    await this.eventProcessor.handleTranscript(runtime, {
      event_id: record.event_id,
      id: record.id,
      seq: record.seq,
      at_ms: record.at_ms,
      speaker: record.speaker,
      text: record.text,
      final: record.final,
    });

    await this.statusUpdater.updateAndPushStatus(runtime);
  }

  async handleTranscriptInsert(transcript: unknown): Promise<void> {
    if (!isRealtimeTranscript(transcript)) {
      console.warn('[transcripts] Ignoring invalid realtime transcript payload');
      return;
    }

    const eventId = transcript.event_id;
    const runtime = this.runtimeService.getRuntime(eventId);
    if (!runtime) {
      return;
    }

    if (transcript.seq !== undefined && transcript.seq <= runtime.transcriptLastSeq) {
      return;
    }

    await this.eventProcessor.handleTranscript(runtime, transcript);
  }

  private recordTranscriptUsage(
    runtime: EventRuntime,
    seq: number,
    usage: RealtimeTranscriptionUsageDTO | undefined
  ): void {
    if (!usage || usage.type !== 'tokens') {
      return;
    }

    const totalTokens = usage.total_tokens;
    const budgetStatus = checkBudgetStatus(totalTokens, 2048);

    const breakdown: Record<string, number> = {};
    if (typeof usage.input_tokens === 'number' && Number.isFinite(usage.input_tokens)) {
      breakdown.input = usage.input_tokens;
    }
    if (typeof usage.output_tokens === 'number' && Number.isFinite(usage.output_tokens)) {
      breakdown.output = usage.output_tokens;
    }
    const details = usage.input_token_details;
    if (details && typeof details === 'object') {
      const detailsRecord = details as Record<string, unknown>;

      const audioTokens = detailsRecord['audio_tokens'];
      if (typeof audioTokens === 'number' && Number.isFinite(audioTokens)) {
        breakdown.audio = audioTokens;
      }

      const textTokens = detailsRecord['text_tokens'];
      if (typeof textTokens === 'number' && Number.isFinite(textTokens)) {
        breakdown.text = textTokens;
      }
    }

    const breakdownStr =
      Object.keys(breakdown).length > 0 ? formatTokenBreakdown(breakdown) : 'none';

    let logLevel: 'log' | 'warn' | 'error' = 'log';
    let logPrefix = '[context]';
    if (budgetStatus.critical) {
      logLevel = 'error';
      logPrefix = '[context] ⚠️ CRITICAL';
    } else if (budgetStatus.warning) {
      logLevel = 'warn';
      logPrefix = '[context] ⚠️ WARNING';
    }

    const logMessage = `${logPrefix} Transcript Agent (seq ${seq}): ${totalTokens}/2048 tokens (${budgetStatus.percentage}%) - breakdown: ${breakdownStr}`;
    const counterKey = 'transcriptUsage';
    const currentCount = runtime.logCounters[counterKey] ?? 0;
    const shouldLog = logLevel !== 'log' || currentCount < 10;

    if (shouldLog) {
      if (logLevel === 'log') {
        runtime.logCounters[counterKey] = currentCount + 1;
      }
      this.logger.log(runtime.eventId, 'transcript', logLevel, logMessage, { seq });
    }

    this.metrics.recordTokens(
      runtime.eventId,
      'transcript',
      totalTokens,
      budgetStatus.warning,
      budgetStatus.critical
    );
  }
}

type RealtimeTranscript = Pick<
  TranscriptRecord,
  'event_id' | 'id' | 'seq' | 'at_ms' | 'speaker' | 'text' | 'final'
>;

const isRealtimeTranscript = (value: unknown): value is RealtimeTranscript => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.event_id !== 'string') {
    return false;
  }

  if (typeof record.text !== 'string') {
    return false;
  }

  if (record.seq !== undefined && typeof record.seq !== 'number') {
    return false;
  }

  if (record.at_ms !== undefined && typeof record.at_ms !== 'number') {
    return false;
  }

  if (record.speaker !== undefined && record.speaker !== null && typeof record.speaker !== 'string') {
    return false;
  }

  if (record.final !== undefined && typeof record.final !== 'boolean') {
    return false;
  }

  if (record.id !== undefined && typeof record.id !== 'number') {
    return false;
  }

  return true;
};

