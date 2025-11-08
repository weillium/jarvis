import type { WorkerSupabaseClient } from '../../../services/supabase';
import type { SupabaseListResult, SupabaseMutationResult } from '../blueprint/types';
import type { ChunkMetadata } from './types';

interface IdRow {
  id: string;
}

export interface ResearchResultRecord {
  content: string;
  metadata: ChunkMetadata | null;
  query: string | null;
  api: string | null;
}

export const fetchActiveResearch = async (
  supabase: WorkerSupabaseClient,
  params: { eventId: string; blueprintId: string }
): Promise<ResearchResultRecord[]> => {
  const { data: activeCycles, error: cycleError }: SupabaseListResult<IdRow> = await supabase
    .from('generation_cycles')
    .select('id')
    .eq('event_id', params.eventId)
    .neq('status', 'superseded')
    .in('cycle_type', ['research']);

  if (cycleError) {
    console.warn(`[chunks] Warning: Failed to fetch active research cycles: ${cycleError.message}`);
  }

  const activeCycleIds = activeCycles?.map((cycle) => cycle.id) ?? [];

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

  const { data: researchData, error: researchError }: SupabaseListResult<ResearchResultRecord> = await researchQuery;

  if (researchError) {
    console.warn(`[chunks] Warning: Failed to fetch research results: ${researchError.message}`);
  }

  return researchData ?? [];
};

export interface ContextItemInsert {
  event_id: string;
  generation_cycle_id: string;
  chunk: string;
  embedding: number[];
  rank: number;
  metadata: Record<string, unknown>;
}

export const insertContextItem = async (
  supabase: WorkerSupabaseClient,
  payload: ContextItemInsert
): Promise<boolean> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('context_items')
    .insert(payload);

  if (error) {
    console.error(`[chunks] Error storing context chunk: ${error.message}`);
    return false;
  }
  return true;
};

export const markCycleProcessing = async (
  supabase: WorkerSupabaseClient,
  cycleId: string,
  targetCount: number
): Promise<void> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update({
      status: 'processing',
      progress_total: targetCount,
    })
    .eq('id', cycleId);

  if (error) {
    console.warn(`[chunks] Failed to mark generation cycle as processing: ${error.message}`);
  }
};

export const updateCycleProgress = async (
  supabase: WorkerSupabaseClient,
  cycleId: string,
  progressCurrent: number
): Promise<void> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update({ progress_current: progressCurrent })
    .eq('id', cycleId);

  if (error) {
    console.warn(`[chunks] Failed to update progress for cycle ${cycleId}: ${error.message}`);
  }
};

export const completeCycle = async (
  supabase: WorkerSupabaseClient,
  cycleId: string,
  metadata: Record<string, unknown>,
  progressCurrent: number
): Promise<void> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update({
      status: 'completed',
      progress_current: progressCurrent,
      completed_at: new Date().toISOString(),
      metadata,
    })
    .eq('id', cycleId);

  if (error) {
    console.error(`[chunks] ERROR: Failed to update generation cycle to completed: ${error.message}`);
    throw new Error(`Failed to update generation cycle: ${error.message}`);
  }
};

