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

const formatSupabaseError = (error: SupabaseMutationResult['error']): string => {
  if (error && typeof error.message === 'string') {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? '[glossary] Unknown Supabase error';
  } catch {
    return '[glossary] Unknown Supabase error';
  }
};

export const insertGlossaryTerm = async (
  supabase: WorkerSupabaseClient,
  payload: GlossaryTermInsert
): Promise<void> => {
  const normalizedTerm = payload.term.trim();
  const updatedAt = new Date().toISOString();

  const updateFields = {
    term: normalizedTerm,
    definition: payload.definition,
    acronym_for: payload.acronym_for,
    category: payload.category,
    usage_examples: payload.usage_examples,
    related_terms: payload.related_terms,
    confidence_score: payload.confidence_score,
    source: payload.source,
    source_url: payload.source_url,
    generation_cycle_id: payload.generation_cycle_id,
    updated_at: updatedAt,
  };

  const {
    data: updatedRows,
    error: updateError,
  }: SupabaseListResult<IdRow> = await supabase
    .from('glossary_terms')
    .update(updateFields)
    .eq('event_id', payload.event_id)
    .ilike('term', normalizedTerm)
    .select('id');

  if (updateError) {
    const message = `[glossary] Error updating glossary term ${normalizedTerm}: ${formatSupabaseError(updateError)}`;
    console.error(message);
    throw new Error(message);
  }

  if (updatedRows && updatedRows.length > 0) {
    return;
  }

  const { error: insertError }: SupabaseMutationResult = await supabase
    .from('glossary_terms')
    .insert({
      ...payload,
      term: normalizedTerm,
      updated_at: updatedAt,
    });

  if (insertError) {
    const message = `[glossary] Error storing glossary term ${normalizedTerm}: ${formatSupabaseError(insertError)}`;
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

