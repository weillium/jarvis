import type { WorkerSupabaseClient } from '../../../services/supabase';
import type { ResearchResults } from '../glossary/types';
import { fetchActiveResearch } from './persistence';
import type { ChunkCandidate } from './types';

interface LoadResearchParams {
  eventId: string;
  blueprintId: string;
  researchResults: ResearchResults | null;
  supabase: WorkerSupabaseClient;
}

export const loadResearchResults = async ({
  eventId,
  blueprintId,
  researchResults,
  supabase,
}: LoadResearchParams): Promise<ResearchResults> => {
  if (researchResults) {
    return researchResults;
  }

  const rows = await fetchActiveResearch(supabase, { eventId, blueprintId });

  return {
    chunks: rows.map((row) => ({
      text: row.content,
      source: row.api || 'research',
      metadata: row.metadata ?? undefined,
    })),
  };
};

export const buildResearchChunkCandidates = (research: ResearchResults): ChunkCandidate[] => {
  return research.chunks
    .filter((chunk) => typeof chunk.text === 'string' && chunk.text.trim().length > 0)
    .map((chunk) => ({
      text: chunk.text.trim(),
      source: chunk.source || 'research',
      researchSource: chunk.metadata?.api || chunk.source || 'research',
      qualityScore: chunk.metadata?.quality_score ?? 0.8,
      metadata: chunk.metadata ?? undefined,
    }));
};

