import { SupabaseService } from '../services/supabase-service';
import { OpenAIService } from '../services/openai-service';

export class VectorSearchService {
  constructor(
    private supabase: SupabaseService,
    private openai: OpenAIService
  ) {}

  async search(
    eventId: string,
    query: string,
    topK: number = 5
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    const queryEmb = await this.openai.createEmbedding(query);
    return this.supabase.vectorSearch(eventId, queryEmb, Math.min(topK, 10));
  }
}
