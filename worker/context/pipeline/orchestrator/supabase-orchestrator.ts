import type { PostgrestResponse, PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';
import type { Blueprint } from '../blueprint-generator';
import type { ContextBlueprintRecord, ResearchResultInsert } from '../../../types';
import {
  ensureBlueprintShape,
  extractId,
  extractIdList,
  mapContextBlueprintRow,
  mapGenerationCycleMetadata,
} from '../../../lib/context-normalization';

export type WorkerSupabaseClient = SupabaseClient;

export type GenerationCycleType =
  | 'blueprint'
  | 'research'
  | 'glossary'
  | 'chunks'
  | 'rankings'
  | 'embeddings'
  | 'full';

export type ResearchInsertResult =
  | { success: true }
  | { success: false; message: string };

export const insertResearchResultRow = async (
  supabase: WorkerSupabaseClient,
  payload: ResearchResultInsert
): Promise<ResearchInsertResult> => {
  const { error } = await supabase.from('research_results').insert(payload);
  if (error) {
    return { success: false, message: error.message };
  }
  return { success: true };
};

export const markGenerationCyclesSuperseded = async (
  supabase: WorkerSupabaseClient,
  params: {
    eventId: string;
    cycleTypes: GenerationCycleType[];
    logContext: string;
    excludeCycleId?: string;
  }
): Promise<void> => {
  const query = supabase
    .from('generation_cycles')
    .update({ status: 'superseded' })
    .eq('event_id', params.eventId)
    .in('cycle_type', params.cycleTypes)
    .in('status', ['started', 'processing', 'completed']);

  if (params.excludeCycleId) {
    query.neq('id', params.excludeCycleId);
  }

  const { error } = await query;
  if (error) {
    console.warn(
      `[context-gen] Warning: Failed to mark ${params.logContext} cycles as superseded: ${error.message}`
    );
  }
};

type IdRow = { id: string };

export async function fetchBlueprintRow(
  supabase: WorkerSupabaseClient,
  blueprintId: string
): Promise<{ record: ContextBlueprintRecord; blueprint: Blueprint }> {
  const response: PostgrestSingleResponse<ContextBlueprintRecord> = await supabase
    .from('context_blueprints')
    .select('*')
    .eq('id', blueprintId)
    .single();

  const { data, error } = response;
  if (error || !data) {
    throw new Error(`Failed to fetch blueprint: ${error?.message || 'Blueprint not found'}`);
  }

  const record = mapContextBlueprintRow(data);
  return {
    record,
    blueprint: ensureBlueprintShape(record.blueprint),
  };
}

export async function createGenerationCycle(
  supabase: WorkerSupabaseClient,
  eventId: string,
  agentId: string,
  blueprintId: string,
  cycleType: GenerationCycleType,
  component?: string
): Promise<string> {
  const response: PostgrestSingleResponse<IdRow> = await supabase
    .from('generation_cycles')
    .insert({
      event_id: eventId,
      agent_id: agentId,
      blueprint_id: blueprintId,
      cycle_type: cycleType,
      component: component || cycleType,
      status: 'started',
      progress_current: 0,
      progress_total: 0,
    })
    .select('id')
    .single();

  const { data, error } = response;
  if (error || !data) {
    throw new Error(`Failed to create generation cycle: ${error?.message || 'Unknown error'}`);
  }

  return extractId(data, 'generation cycle insert');
}

export async function updateGenerationCycle(
  supabase: WorkerSupabaseClient,
  cycleId: string,
  updates: {
    status?: 'started' | 'processing' | 'completed' | 'failed' | 'superseded';
    progress_current?: number;
    progress_total?: number;
    error_message?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const updateData: {
    status?: typeof updates.status;
    progress_current?: number;
    progress_total?: number;
    error_message?: string;
    metadata?: Record<string, unknown>;
    completed_at?: string;
  } = { ...updates };
  if (updates.status === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  if (updates.metadata !== undefined) {
    const metadataResponse: PostgrestSingleResponse<{ metadata: Record<string, unknown> | null }> =
      await supabase
        .from('generation_cycles')
        .select('metadata')
        .eq('id', cycleId)
        .single();

    const existingCycle = metadataResponse.data;
    const mergedMetadata =
      existingCycle !== null && existingCycle !== undefined
        ? mapGenerationCycleMetadata(existingCycle).metadata ?? {}
        : {};
    updateData.metadata = {
      ...mergedMetadata,
      ...updates.metadata,
    };
  }

  const updateResponse: PostgrestResponse<IdRow> = await supabase
    .from('generation_cycles')
    .update(updateData)
    .eq('id', cycleId)
    .select('id');

  const { error, data } = updateResponse;
  if (error) {
    console.error(`[context-gen] ERROR: Failed to update generation cycle ${cycleId}: ${error.message}`);
    throw new Error(`Failed to update generation cycle: ${error.message}`);
  }

  const updatedIds = data ? extractIdList(data, 'generation cycle update') : [];

  if (updatedIds.length === 0) {
    console.warn(
      `[context-gen] WARNING: Generation cycle ${cycleId} not found or update affected 0 rows`
    );
  } else if (updates.status === 'completed') {
    console.log(`[context-gen] Generation cycle ${cycleId} marked as completed`);
  }
}

export async function updateAgentStatus(
  supabase: WorkerSupabaseClient,
  agentId: string,
  stage: string
): Promise<void> {
  const status = stage === 'running' ? 'active' : 'idle';

  const { error } = await supabase
    .from('agents')
    .update({ status, stage })
    .eq('id', agentId);

  if (error) {
    throw new Error(`Failed to update agent status: ${error.message}`);
  }
}

export async function updateBlueprintStatus(
  supabase: WorkerSupabaseClient,
  blueprintId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  const allowedStatuses = ['generating', 'approved', 'error'];
  if (!allowedStatuses.includes(status)) {
    console.warn(`[context-gen] Warning: Blueprint status '${status}' not allowed, skipping update`);
    return;
  }

  const update: { status: string; error_message?: string } = { status };
  if (errorMessage) {
    update.error_message = errorMessage;
  }

  const { error } = await supabase
    .from('context_blueprints')
    .update(update)
    .eq('id', blueprintId);

  if (error) {
    console.warn(`[context-gen] Warning: Failed to update blueprint status: ${error.message}`);
  }
}
