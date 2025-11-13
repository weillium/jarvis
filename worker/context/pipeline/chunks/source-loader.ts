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
    .map((chunk) => {
      const metadata = chunk.metadata ?? undefined;
      const agentUtilityRaw = metadata?.agent_utility;
      const agentUtility = Array.isArray(agentUtilityRaw)
        ? agentUtilityRaw.filter(
            (agent): agent is 'facts' | 'cards' | 'glossary' =>
              agent === 'facts' || agent === 'cards' || agent === 'glossary'
          )
        : undefined;

      const queryPriority =
        typeof metadata?.query_priority === 'number'
          ? metadata.query_priority
          : typeof metadata?.priority === 'number'
            ? metadata.priority
            : undefined;

      const provenanceHint =
        typeof metadata?.provenance_hint === 'string' && metadata.provenance_hint.trim().length > 0
          ? metadata.provenance_hint
          : undefined;

      return {
        text: chunk.text.trim(),
        source: chunk.source || 'research',
        researchSource: metadata?.api || chunk.source || 'research',
        qualityScore: metadata?.quality_score ?? 0.8,
        metadata,
        agentUtility,
        queryPriority,
        provenanceHint,
      };
    });
};

