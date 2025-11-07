import type {
  PostgrestResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { VectorMatchRecord } from '../../types';
import { mapVectorMatchRecords } from './dto-mappers';

export class VectorSearchGateway {
  constructor(private readonly client: SupabaseClient) {}

  async search(
    eventId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<VectorMatchRecord[]> {
    const rpcResponse = await this.client.rpc('match_context', {
      p_event: eventId,
      p_query: queryEmbedding,
      p_limit: topK,
    });
    const response: PostgrestResponse<unknown> = rpcResponse;

    if (response.error) throw response.error;
    return mapVectorMatchRecords(response.data);
  }
}
