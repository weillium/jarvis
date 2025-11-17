import type { TranscriptChunk } from '../types';
import type { TranscriptsRepository } from '../services/supabase/transcripts-repository';

interface RawTranscriptPayload {
  id?: number;
  seq?: number | null;
  at_ms?: number | null;
  speaker?: string | null;
  text?: unknown;
  final?: unknown;
}

const isRawTranscriptPayload = (value: unknown): value is RawTranscriptPayload =>
  typeof value === 'object' && value !== null;

const extractText = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const extractNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

const extractBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const extractSpeaker = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export class TranscriptProcessor {
  constructor(private readonly transcriptsRepo: TranscriptsRepository) {}

  convertToChunk(transcript: unknown): TranscriptChunk {
    if (!isRawTranscriptPayload(transcript)) {
      throw new TypeError('Invalid transcript payload');
    }

    const text = extractText(transcript.text);
    if (!text) {
      throw new TypeError('Transcript payload missing text');
    }

    const seq = extractNumber(transcript.seq) ?? 0;
    const atMs = extractNumber(transcript.at_ms) ?? Date.now();
    const finalFlag = extractBoolean(transcript.final);
    const final = finalFlag === null ? true : finalFlag;
    const transcriptId = extractNumber(transcript.id) ?? undefined;

    return {
      seq,
      at_ms: atMs,
      speaker: extractSpeaker(transcript.speaker),
      text,
      final,
      transcript_id: transcriptId,
    };
  }

  async ensureSequenceNumber(transcriptId: number | undefined, nextSeq: number): Promise<void> {
    if (transcriptId === undefined || transcriptId === null) {
      return;
    }

    await this.transcriptsRepo.updateTranscriptSeq(transcriptId, nextSeq);
  }
}
