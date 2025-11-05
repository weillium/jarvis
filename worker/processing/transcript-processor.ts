import { TranscriptChunk } from '../types';
import { SupabaseService } from '../services/supabase-service';

export class TranscriptProcessor {
  constructor(private supabase: SupabaseService) {}

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

    await this.supabase.updateTranscriptSeq(transcriptId, nextSeq);
  }
}
