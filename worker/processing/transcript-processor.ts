import { TranscriptChunk } from '../types';
import { TranscriptsRepository } from '../services/supabase/transcripts-repository';

export class TranscriptProcessor {
  constructor(private readonly transcriptsRepo: TranscriptsRepository) {}

  convertToChunk(transcript: any): TranscriptChunk {
    return {
      seq: transcript.seq || 0,
      at_ms: transcript.at_ms || Date.now(),
      speaker: transcript.speaker || undefined,
      text: transcript.text,
      final: transcript.final !== false,
      transcript_id: transcript.id,
    };
  }

  async ensureSequenceNumber(transcriptId: number | undefined, nextSeq: number): Promise<void> {
    if (transcriptId === undefined || transcriptId === null) {
      return;
    }

    await this.transcriptsRepo.updateTranscriptSeq(transcriptId, nextSeq);
  }
}
