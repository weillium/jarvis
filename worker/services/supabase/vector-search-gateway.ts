import type { SupabaseClient } from '@supabase/supabase-js';

export class VectorSearchGateway {
  constructor(private readonly client: SupabaseClient) {}

  async search(
    eventId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    const { data, error } = await this.client.rpc('match_context', {
      p_event: eventId,
      p_query: queryEmbedding,
      p_limit: topK,
    });

    if (error) throw error;
    return (data || []) as Array<{ id: string; chunk: string; similarity: number }>;
  }
}
