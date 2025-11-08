import type { WorkerSupabaseClient } from '../../../services/supabase';
import type {
  SupabaseListResult,
  SupabaseMutationResult,
} from '../blueprint/types';

interface IdRow {
  id: string;
}

export interface ResearchResultRecord {
  content: string;
  metadata: Record<string, unknown> | null;
  query: string | null;
  api: string | null;
}

export const fetchActiveResearchResults = async (
  supabase: WorkerSupabaseClient,
  params: {
    eventId: string;
    blueprintId: string;
  }
): Promise<ResearchResultRecord[]> => {
  const { data: activeCycles, error: cycleError }: SupabaseListResult<IdRow> = await supabase
    .from('generation_cycles')
    .select('id')
    .eq('event_id', params.eventId)
    .neq('status', 'superseded')
    .in('cycle_type', ['research']);

  if (cycleError) {
    console.warn(`[glossary] Warning: Failed to fetch active research cycles: ${cycleError.message}`);
  }

  const activeCycleIds: string[] = [];
  if (activeCycles && activeCycles.length > 0) {
    activeCycleIds.push(...activeCycles.map((cycle: IdRow) => cycle.id));
  }

  let researchQuery = supabase
    .from('research_results')
    .select('content, metadata, query, api')
    .eq('event_id', params.eventId)
    .eq('blueprint_id', params.blueprintId);

  if (activeCycleIds.length > 0) {
    researchQuery = researchQuery.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeCycleIds.join(',')})`);
  } else {
    researchQuery = researchQuery.is('generation_cycle_id', null);
  }

  const {
    data: researchData,
    error: researchError,
  }: SupabaseListResult<ResearchResultRecord> = await researchQuery;

  if (researchError) {
    console.warn(`[glossary] Warning: Failed to fetch research results: ${researchError.message}`);
  }

  return researchData ?? [];
};

export interface GlossaryTermInsert {
  event_id: string;
  generation_cycle_id: string;
  term: string;
  definition: string;
  acronym_for: string | null;
  category: string;
  usage_examples: string[];
  related_terms: string[];
  confidence_score: number;
  source: string;
  source_url: string | null;
}

export const insertGlossaryTerm = async (
  supabase: WorkerSupabaseClient,
  payload: GlossaryTermInsert
): Promise<void> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('glossary_terms')
    .insert(payload);

  if (error) {
    let errorMessage =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
        ? (error as { message: string }).message
        : null;

    if (!errorMessage) {
      try {
        const serialized = JSON.stringify(error);
        errorMessage = serialized ?? '[glossary] Unknown Supabase error';
      } catch {
        errorMessage = '[glossary] Unknown Supabase error';
      }
    }

    const message = `[glossary] Error storing glossary term ${payload.term}: ${errorMessage}`;
    console.error(message);
    throw new Error(message);
  }
};

export const updateGlossaryCycle = async (
  supabase: WorkerSupabaseClient,
  cycleId: string,
  updates: Record<string, unknown>
): Promise<boolean> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(updates)
    .eq('id', cycleId);

  if (error) {
    console.warn(`[glossary] Failed to update generation cycle: ${error.message}`);
    return false;
  }
  return true;
};

