import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { InsertTranscriptParams, TranscriptRecord } from './types';
import { mapTranscriptRecord, mapTranscriptRecords } from './dto-mappers';

type TranscriptCallback = (payload: { new: unknown }) => void;

export class TranscriptsRepository {
  constructor(private readonly client: SupabaseClient) {}

  subscribeToTranscripts(callback: TranscriptCallback): { unsubscribe: () => Promise<void> } {
    const channel = this.client
      .channel('transcript_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
        },
        callback
      )
      .subscribe();

    return {
      unsubscribe: async () => {
        await this.client.removeChannel(channel);
      },
    };
  }

  async getTranscriptsForReplay(
    eventId: string,
    sinceSeq: number,
    limit: number = 1000
  ): Promise<TranscriptRecord[]> {
    const transcriptsQuery = this.client
      .from('transcripts')
      .select('id, seq, at_ms, speaker, text, final')
      .eq('event_id', eventId)
      .gt('seq', sinceSeq)
      .order('seq', { ascending: true })
      .limit(limit);
    const response: PostgrestResponse<unknown> = await transcriptsQuery;

    if (response.error) throw response.error;
    return mapTranscriptRecords(response.data);
  }

  async insertTranscript(params: InsertTranscriptParams): Promise<TranscriptRecord> {
    const insertQuery = this.client
      .from('transcripts')
      .insert({
        event_id: params.event_id,
        seq: params.seq,
        text: params.text,
        at_ms: params.at_ms,
        final: params.final,
        speaker: params.speaker ?? null,
      })
      .select('id, event_id, seq, at_ms, speaker, text, final')
      .single();
    const response: PostgrestSingleResponse<unknown> = await insertQuery;

    if (response.error || !response.data) {
      throw response.error ?? new Error('Failed to insert transcript');
    }
    return mapTranscriptRecord(response.data);
  }

  async updateTranscriptSeq(transcriptId: number, seq: number): Promise<void> {
    const { error } = await this.client
      .from('transcripts')
      .update({ seq })
      .eq('id', transcriptId);

    if (error) throw error;
  }
}
