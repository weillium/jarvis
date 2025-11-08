import type { Blueprint } from './types';
import type {
  SupabaseListResult,
  SupabaseMutationResult,
  SupabaseSingleResult,
  WorkerSupabaseClient,
} from './types';

const asDbPayload = <T>(payload: T) => payload as unknown as never;

interface EventRecord {
  id: string;
  title: string;
  topic: string | null;
}

interface BlueprintRecord {
  id: string;
}

interface GenerationCycleRecord {
  id: string;
}

export const ensureAgentBlueprintStage = async (
  supabase: WorkerSupabaseClient,
  agentId: string
): Promise<void> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('agents')
    .update(asDbPayload({ status: 'idle', stage: 'blueprint' }))
    .eq('id', agentId);

  if (error) {
    throw new Error(`Failed to update agent status: ${error.message}`);
  }
};

export const fetchEventRecord = async (
  supabase: WorkerSupabaseClient,
  eventId: string
): Promise<EventRecord> => {
  const { data, error }: SupabaseSingleResult<EventRecord> = await supabase
    .from('events')
    .select('id, title, topic')
    .eq('id', eventId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch event: ${error?.message || 'Event not found'}`);
  }

  return data;
};

export const insertBlueprintRecord = async (
  supabase: WorkerSupabaseClient,
  eventId: string,
  agentId: string
): Promise<string> => {
  const { data, error }: SupabaseSingleResult<BlueprintRecord> = await supabase
    .from('context_blueprints')
    .insert(
      asDbPayload({
        event_id: eventId,
        agent_id: agentId,
        status: 'generating',
      })
    )
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create blueprint record: ${error?.message || 'Insert failed'}`);
  }

  return data.id;
};

export const createBlueprintGenerationCycle = async (
  supabase: WorkerSupabaseClient,
  params: {
    eventId: string;
    agentId: string;
    blueprintId: string;
  }
): Promise<string | null> => {
  try {
    const { data, error }: SupabaseSingleResult<GenerationCycleRecord> = await supabase
      .from('generation_cycles')
      .insert(
        asDbPayload({
          event_id: params.eventId,
          agent_id: params.agentId,
          blueprint_id: params.blueprintId,
          cycle_type: 'blueprint',
          component: 'blueprint',
          status: 'processing',
          progress_current: 0,
          progress_total: 0,
        })
      )
      .select('id')
      .single();

    if (error || !data) {
      console.warn(
        `[blueprint] Failed to create generation cycle: ${error?.message || 'Unknown error'}`
      );
      return null;
    }

    return data.id;
  } catch (err: unknown) {
    console.error('[blueprint-generator] error:', String(err));
    return null;
  }
};

export const updateBlueprintRecord = async (
  supabase: WorkerSupabaseClient,
  params: {
    blueprintId: string;
    blueprint: Blueprint;
  }
): Promise<void> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('context_blueprints')
    .update(
      asDbPayload({
        status: 'ready',
        blueprint: params.blueprint,
        important_details: params.blueprint.important_details,
        inferred_topics: params.blueprint.inferred_topics,
        key_terms: params.blueprint.key_terms,
        research_plan: params.blueprint.research_plan,
        research_apis: params.blueprint.research_plan.queries.map((q) => q.api),
        research_search_count: params.blueprint.research_plan.total_searches,
        estimated_cost: params.blueprint.cost_breakdown.total,
        glossary_plan: params.blueprint.glossary_plan,
        chunks_plan: params.blueprint.chunks_plan,
        target_chunk_count: params.blueprint.chunks_plan.target_count,
        quality_tier: params.blueprint.chunks_plan.quality_tier,
      })
    )
    .eq('id', params.blueprintId);

  if (error) {
    throw new Error(`Failed to update blueprint: ${error.message}`);
  }
};

export const updateGenerationCycleWithCost = async (
  supabase: WorkerSupabaseClient,
  params: {
    generationCycleId: string;
    metadata: Record<string, unknown>;
  }
): Promise<void> => {
  const { error }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(
      asDbPayload({
        status: 'completed',
        progress_current: 1,
        progress_total: 1,
        metadata: params.metadata,
      })
    )
    .eq('id', params.generationCycleId);

  if (error) {
    console.warn(`[blueprint] Failed to update generation cycle: ${error.message}`);
  }
};

export const supersedeExistingBlueprints = async (
  supabase: WorkerSupabaseClient,
  params: {
    eventId: string;
    agentId: string;
    currentBlueprintId: string;
  }
): Promise<void> => {
  const {
    data: existingBlueprints,
    error: checkError,
  }: SupabaseListResult<BlueprintRecord> = await supabase
    .from('context_blueprints')
    .select('id')
    .eq('agent_id', params.agentId)
    .neq('id', params.currentBlueprintId)
    .in('status', ['generating', 'ready', 'approved']);

  if (checkError || !existingBlueprints || existingBlueprints.length === 0) {
    return;
  }

  const blueprintIds = existingBlueprints.map((b) => b.id);

  const { error: supersedeError }: SupabaseMutationResult = await supabase
    .from('context_blueprints')
    .update(
      asDbPayload({
        status: 'superseded',
        superseded_at: new Date().toISOString(),
      })
    )
    .eq('agent_id', params.agentId)
    .in('id', blueprintIds);

  if (supersedeError) {
    console.warn(
      `[blueprint] Warning: Failed to mark existing blueprints as superseded: ${supersedeError.message}`
    );
    return;
  }

  const { error: blueprintCycleError }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(asDbPayload({ status: 'superseded' }))
    .eq('event_id', params.eventId)
    .in('blueprint_id', blueprintIds)
    .eq('cycle_type', 'blueprint')
    .in('status', ['started', 'processing', 'completed']);

  if (blueprintCycleError) {
    console.warn(
      `[blueprint] Warning: Failed to mark blueprint cycles as superseded: ${blueprintCycleError.message}`
    );
  }

  const { error: downstreamCycleError }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(asDbPayload({ status: 'superseded' }))
    .eq('event_id', params.eventId)
    .in('blueprint_id', blueprintIds)
    .in('cycle_type', ['research', 'glossary', 'chunks'])
    .in('status', ['started', 'processing', 'completed']);

  if (downstreamCycleError) {
    console.warn(
      `[blueprint] Warning: Failed to mark downstream cycles as superseded: ${downstreamCycleError.message}`
    );
  }
};

