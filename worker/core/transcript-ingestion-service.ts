import type { RuntimeService } from './runtime-service';
import type { SessionLifecycle } from './session-lifecycle';
import type { EventProcessor } from './event-processor';
import type { EventRuntime } from '../types';
import type { TranscriptsRepository } from '../services/supabase/transcripts-repository';
import type { TranscriptRecord } from '../types';

export interface TranscriptAudioChunk {
  audioBase64: string;
  seq?: number;
  isFinal?: boolean;
  sampleRate?: number;
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
    private readonly transcriptOnly: boolean
  ) {}

  async appendAudio(eventId: string, chunk: TranscriptAudioChunk): Promise<EventRuntime> {
    const runtime = await this.runtimeService.ensureRuntime(eventId);

    if (!runtime.transcriptSession) {
      await this.sessionLifecycle.createRealtimeSessions({
        runtime,
        eventId,
        agentId: runtime.agentId,
        transcriptOnly: this.transcriptOnly,
      });
    }

    if (!runtime.transcriptSession) {
      throw new Error(`Transcript session unavailable for event ${eventId}`);
    }

    await this.sessionLifecycle.appendTranscriptAudio(runtime, {
      audioBase64: chunk.audioBase64,
      isFinal: chunk.isFinal,
      sampleRate: chunk.sampleRate,
      encoding: chunk.encoding,
      durationMs: chunk.durationMs,
      speaker: chunk.speaker,
    });

    runtime.pendingTranscriptChunk = {
      speaker: chunk.speaker ?? null,
      sampleRate: chunk.sampleRate,
      encoding: chunk.encoding,
      durationMs: chunk.durationMs,
    };

    return runtime;
  }

  async handleRealtimeTranscript(
    eventId: string,
    agentId: string,
    runtime: EventRuntime,
    payload: { text: string; isFinal?: boolean; receivedAt?: string }
  ): Promise<void> {
    const text = payload.text?.trim();
    if (!text) {
      return;
    }

    const seq = runtime.transcriptLastSeq + 1;
    const atMs = payload.receivedAt ? Date.parse(payload.receivedAt) || Date.now() : Date.now();
    const final = payload.isFinal !== false;
    const speaker = runtime.pendingTranscriptChunk?.speaker ?? null;

    const record = await this.transcriptsRepository.insertTranscript({
      event_id: eventId,
      seq,
      text,
      at_ms: atMs,
      final,
      speaker,
    });

    runtime.pendingTranscriptChunk = undefined;

    runtime.ringBuffer.add({
      seq,
      at_ms: atMs,
      speaker: speaker ?? undefined,
      text,
      final,
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
