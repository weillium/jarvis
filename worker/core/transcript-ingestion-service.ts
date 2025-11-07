import { RuntimeService } from './runtime-service';
import { SessionLifecycle } from './session-lifecycle';
import { EventProcessor } from './event-processor';
import type { EventRuntime } from '../types';
import { TranscriptsRepository } from '../services/supabase/transcripts-repository';

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

  async handleTranscriptInsert(transcript: any): Promise<void> {
    const eventId = transcript.event_id;
    const runtime = this.runtimeService.getRuntime(eventId);
    if (!runtime) {
      return;
    }

    if (typeof transcript.seq === 'number' && transcript.seq <= runtime.transcriptLastSeq) {
      return;
    }

    await this.eventProcessor.handleTranscript(runtime, transcript);
  }
}
