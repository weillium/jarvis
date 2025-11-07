import { OpenAIService } from '../services/openai-service';
import { VectorSearchGateway } from '../services/supabase/vector-search-gateway';

export class VectorSearchService {
  constructor(
    private readonly vectorSearch: VectorSearchGateway,
    private openai: OpenAIService
  ) {}

  async search(
    eventId: string,
    query: string,
    topK: number = 5
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    const queryEmb = await this.openai.createEmbedding(query);
    return this.vectorSearch.search(eventId, queryEmb, Math.min(topK, 10));
  }
}
