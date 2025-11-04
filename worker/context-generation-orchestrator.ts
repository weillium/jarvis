/**
 * Context Generation Orchestrator
 * Orchestrates the execution of context generation blueprint
 * 
 * Flow:
 * 1. Execute research plan (Exa/Wikipedia) → Store in research_results
 * 2. Build glossary → Store with generation_cycle_id
 * 3. Build chunks (ranked, up to 1000) → Store with generation_cycle_id
 * 4. Update status to 'context_complete'
 * 
 * Uses generation_cycles for tracking and versioning
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Blueprint } from './blueprint-generator';
import { buildGlossary, GlossaryBuilderOptions, ResearchResults } from './glossary-builder';
import { buildContextChunks, ChunksBuilderOptions } from './chunks-builder';

export interface ContextGenerationOrchestratorOptions {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
}

/**
 * Create a generation cycle record
 */
async function createGenerationCycle(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  agentId: string,
  blueprintId: string,
  cycleType: 'blueprint' | 'research' | 'glossary' | 'chunks' | 'rankings' | 'embeddings' | 'full',
  component?: string
): Promise<string> {
  const { data, error } = await (supabase
    .from('generation_cycles') as any)
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

  if (error || !data) {
    throw new Error(`Failed to create generation cycle: ${error?.message || 'Unknown error'}`);
  }

  return data.id;
}

/**
 * Update generation cycle status and progress
 */
async function updateGenerationCycle(
  supabase: ReturnType<typeof createClient>,
  cycleId: string,
  updates: {
    status?: 'started' | 'processing' | 'completed' | 'failed' | 'superseded';
    progress_current?: number;
    progress_total?: number;
    error_message?: string;
  }
): Promise<void> {
  const updateData: any = { ...updates };
  if (updates.status === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { error } = await (supabase
    .from('generation_cycles') as any)
    .update(updateData)
    .eq('id', cycleId);

  if (error) {
    console.warn(`[context-gen] Warning: Failed to update generation cycle: ${error.message}`);
  }
}

/**
 * Execute context generation based on approved blueprint
 */
export async function executeContextGeneration(
  eventId: string,
  agentId: string,
  blueprintId: string,
  options: ContextGenerationOrchestratorOptions
): Promise<void> {
  const { supabase, openai, embedModel, genModel } = options;

  console.log(`[context-gen] Executing context generation for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  try {
    // 1. Fetch blueprint
    const { data: blueprintRecord, error: blueprintError } = await (supabase
      .from('context_blueprints') as any)
      .select('*')
      .eq('id', blueprintId)
      .single() as { data: any | null; error: any };

    if (blueprintError || !blueprintRecord) {
      throw new Error(`Failed to fetch blueprint: ${blueprintError?.message || 'Blueprint not found'}`);
    }

    const blueprint = blueprintRecord.blueprint as Blueprint;

    // 2. Update status to 'researching'
    await updateAgentStatus(supabase, agentId, 'researching');
    // Blueprint status stays 'approved' - execution tracked via agent status and generation_cycles

    // 3. Create research generation cycle
    const researchCycleId = await createGenerationCycle(
      supabase,
      eventId,
      agentId,
      blueprintId,
      'research',
      'research'
    );

    // 4. Execute research plan and store in research_results
    console.log(`[context-gen] Executing research plan with ${blueprint.research_plan.queries.length} queries`);
    const researchResults = await executeResearchPlan(
      eventId,
      blueprintId,
      blueprint,
      researchCycleId,
      { supabase, openai, genModel }
    );

    console.log(`[context-gen] Research completed: ${researchResults.chunks.length} chunks found`);

    // 5. Create glossary generation cycle
    const glossaryCycleId = await createGenerationCycle(
      supabase,
      eventId,
      agentId,
      blueprintId,
      'glossary',
      'glossary'
    );

    // 6. Update status to 'building_glossary'
    await updateAgentStatus(supabase, agentId, 'building_glossary');

    // 7. Build glossary (fetches research from research_results table)
    const glossaryCount = await buildGlossary(
      eventId,
      blueprintId,
      glossaryCycleId,
      blueprint,
      null, // Pass null to fetch from research_results table
      {
        supabase,
        openai,
        genModel,
        embedModel,
      }
    );

    console.log(`[context-gen] Glossary built: ${glossaryCount} terms`);

    // 8. Create chunks generation cycle
    const chunksCycleId = await createGenerationCycle(
      supabase,
      eventId,
      agentId,
      blueprintId,
      'chunks',
      'llm_chunks'
    );

    // 9. Update status to 'building_chunks'
    await updateAgentStatus(supabase, agentId, 'building_chunks');

    // 10. Build chunks (fetches research from research_results table)
    const chunksCount = await buildContextChunks(
      eventId,
      blueprintId,
      chunksCycleId,
      blueprint,
      null, // Pass null to fetch from research_results table
      {
        supabase,
        openai,
        embedModel,
        genModel,
      }
    );

    console.log(`[context-gen] Chunks built: ${chunksCount} chunks`);

    // 8. Update status to 'context_complete'
    await updateAgentStatus(supabase, agentId, 'context_complete');
    // Blueprint status stays 'approved' - completion tracked via agent status

    console.log(`[context-gen] Context generation complete for event ${eventId}`);
  } catch (error: any) {
    console.error(`[context-gen] Error executing context generation: ${error.message}`);
    
    // Update status to error
    await updateAgentStatus(supabase, agentId, 'error').catch(() => {});
    await updateBlueprintStatus(supabase, blueprintId, 'error', error.message).catch(() => {});
    
    // Mark any active generation cycles as failed
    await (supabase
      .from('generation_cycles') as any)
      .update({
        status: 'failed',
        error_message: error.message,
      })
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .in('status', ['started', 'processing'])
      .catch(() => {});
    
    throw error;
  }
}

/**
 * Execute research plan from blueprint and store in research_results table
 * Currently uses stub - Exa integration will be added in Step 7
 */
async function executeResearchPlan(
  eventId: string,
  blueprintId: string,
  blueprint: Blueprint,
  generationCycleId: string,
  options: { supabase: ReturnType<typeof createClient>; openai: OpenAI; genModel: string }
): Promise<ResearchResults> {
  const { supabase, openai, genModel } = options;
  const queries = blueprint.research_plan.queries || [];

  console.log(`[research] Executing ${queries.length} research queries`);

  const chunks: ResearchResults['chunks'] = [];
  let insertedCount = 0;

  // Update cycle to processing
  await updateGenerationCycle(supabase, generationCycleId, {
    status: 'processing',
    progress_total: queries.length,
  });

  // Process queries (stub implementation - will be enhanced with Exa API in Step 7)
  for (let i = 0; i < queries.length; i++) {
    const queryItem = queries[i];
    try {
      if (queryItem.api === 'wikipedia') {
        // TODO: Implement Wikipedia enricher
        console.log(`[research] Wikipedia query (stub): ${queryItem.query}`);
        // For now, skip Wikipedia queries
        continue;
      } else if (queryItem.api === 'exa') {
        // TODO: Implement Exa API integration (Step 7)
        console.log(`[research] Exa query (stub): ${queryItem.query}`);
        // For now, generate stub chunks based on query
        const stubChunks = await generateStubResearchChunks(queryItem.query, openai, genModel);
        
        // Store each chunk in research_results table
        for (const chunkText of stubChunks) {
          const metadata = {
            api: 'exa',
            query: queryItem.query,
            quality_score: 0.7, // Lower quality for stub
          };

          const { error } = await (supabase
            .from('research_results') as any)
            .insert({
              event_id: eventId,
              blueprint_id: blueprintId,
              generation_cycle_id: generationCycleId,
              query: queryItem.query,
              api: 'llm_stub', // Using llm_stub since it's a stub
              content: chunkText,
              quality_score: metadata.quality_score,
              metadata: metadata,
              is_active: true,
              version: 1,
            });

          if (error) {
            console.error(`[research] Error storing research result: ${error.message}`);
          } else {
            insertedCount++;
            chunks.push({
              text: chunkText,
              source: 'research_stub',
              metadata,
            });
          }
        }
      }

      // Update progress
      await updateGenerationCycle(supabase, generationCycleId, {
        progress_current: i + 1,
      });
    } catch (error: any) {
      console.error(`[research] Error processing query "${queryItem.query}": ${error.message}`);
      // Continue with other queries
    }
  }

  // Mark cycle as completed
  await updateGenerationCycle(supabase, generationCycleId, {
    status: 'completed',
    progress_current: queries.length,
  });

  console.log(`[research] Stored ${insertedCount} research results in database`);
  return { chunks };
}

/**
 * Generate stub research chunks (temporary until Exa integration)
 */
async function generateStubResearchChunks(
  query: string,
  openai: OpenAI,
  genModel: string
): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: genModel,
      messages: [
        {
          role: 'system',
          content: 'You are a research assistant. Generate 2-3 informative context chunks (200-300 words each) based on a research query.',
        },
        {
          role: 'user',
          content: `Generate informative context chunks about: ${query}\n\nReturn as JSON with "chunks" array.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    return parsed.chunks || [];
  } catch (error: any) {
    console.error(`[research] Error generating stub chunks: ${error.message}`);
    return [];
  }
}

/**
 * Update agent status
 */
async function updateAgentStatus(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  status: string
): Promise<void> {
  const { error } = await (supabase
    .from('agents') as any)
    .update({ status })
    .eq('id', agentId);

  if (error) {
    throw new Error(`Failed to update agent status: ${error.message}`);
  }
}

/**
 * Update blueprint status
 */
async function updateBlueprintStatus(
  supabase: ReturnType<typeof createClient>,
  blueprintId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  // Only allow: 'generating', 'ready', 'approved', 'error'
  // 'executing' and 'completed' removed - tracked via agent status and generation_cycles
  const allowedStatuses = ['generating', 'ready', 'approved', 'error'];
  if (!allowedStatuses.includes(status)) {
    console.warn(`[context-gen] Warning: Blueprint status '${status}' not allowed, skipping update`);
    return;
  }

  const update: any = { status };
  if (errorMessage) {
    update.error_message = errorMessage;
  }

  const { error } = await (supabase
    .from('context_blueprints') as any)
    .update(update)
    .eq('id', blueprintId);

  if (error) {
    console.warn(`[context-gen] Warning: Failed to update blueprint status: ${error.message}`);
    // Don't throw - status update is not critical
  }
}

/**
 * Regenerate research stage only
 * Requires: Approved blueprint
 */
export async function regenerateResearchStage(
  eventId: string,
  agentId: string,
  blueprintId: string,
  options: ContextGenerationOrchestratorOptions
): Promise<ResearchResults> {
  const { supabase, openai, genModel } = options;

  console.log(`[context-gen] Regenerating research stage for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  // Fetch blueprint
  const { data: blueprintRecord, error: blueprintError } = await (supabase
    .from('context_blueprints') as any)
    .select('*')
    .eq('id', blueprintId)
    .single() as { data: any | null; error: any };

  if (blueprintError || !blueprintRecord) {
    throw new Error(`Failed to fetch blueprint: ${blueprintError?.message || 'Blueprint not found'}`);
  }

  const blueprint = blueprintRecord.blueprint as Blueprint;

  if (blueprintRecord.status !== 'approved') {
    throw new Error(`Blueprint must be approved to regenerate research. Current status: ${blueprintRecord.status}`);
  }

  // Soft delete existing research results
  const { error: softDeleteError } = await (supabase
    .from('research_results') as any)
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)
    .eq('blueprint_id', blueprintId)
    .eq('is_active', true);

  if (softDeleteError) {
    console.warn(`[context-gen] Warning: Failed to soft delete existing research: ${softDeleteError.message}`);
  }

  // Create generation cycle
  const researchCycleId = await createGenerationCycle(
    supabase,
    eventId,
    agentId,
    blueprintId,
    'research',
    'research'
  );

  // Update status
  await updateAgentStatus(supabase, agentId, 'researching');
  // Blueprint status stays 'approved'

  // Execute research and store in research_results
  const researchResults = await executeResearchPlan(
    eventId,
    blueprintId,
    blueprint,
    researchCycleId,
    { supabase, openai, genModel }
  );

  console.log(`[context-gen] Research regeneration completed: ${researchResults.chunks.length} chunks found`);

  // Mark downstream components (glossary, chunks) as needing regeneration
  // Soft delete glossary and chunks that depend on the old research
  const { error: glossaryDeleteError } = await (supabase
    .from('glossary_terms') as any)
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)
    .eq('is_active', true);

  if (glossaryDeleteError) {
    console.warn(`[context-gen] Warning: Failed to soft delete glossary after research regeneration: ${glossaryDeleteError.message}`);
  }

  // Soft delete non-research chunks (preserve any research chunks)
  const { error: chunksDeleteError } = await (supabase
    .from('context_items') as any)
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)
    .eq('is_active', true)
    .neq('component_type', 'research');

  if (chunksDeleteError) {
    console.warn(`[context-gen] Warning: Failed to soft delete chunks after research regeneration: ${chunksDeleteError.message}`);
  }

  // Mark any active generation cycles for glossary/chunks as superseded
  await (supabase
    .from('generation_cycles') as any)
    .update({
      status: 'superseded',
    })
    .eq('event_id', eventId)
    .in('cycle_type', ['glossary', 'chunks'])
    .in('status', ['started', 'processing', 'completed'])
    .catch(() => {});

  console.log(`[context-gen] Downstream components (glossary, chunks) marked for regeneration`);

  // Automatically regenerate downstream components since research changed
  console.log(`[context-gen] Auto-regenerating downstream components after research regeneration`);
  
  try {
    // Regenerate glossary
    const glossaryCycleId = await createGenerationCycle(
      supabase,
      eventId,
      agentId,
      blueprintId,
      'glossary',
      'glossary'
    );

    await updateAgentStatus(supabase, agentId, 'building_glossary');
    const glossaryCount = await buildGlossary(
      eventId,
      blueprintId,
      glossaryCycleId,
      blueprint,
      null, // Fetch from research_results table
      {
        supabase,
        openai,
        genModel,
        embedModel,
      }
    );
    console.log(`[context-gen] Glossary auto-regenerated: ${glossaryCount} terms`);

    // Regenerate chunks
    const chunksCycleId = await createGenerationCycle(
      supabase,
      eventId,
      agentId,
      blueprintId,
      'chunks',
      'llm_chunks'
    );

    await updateAgentStatus(supabase, agentId, 'building_chunks');
    const chunksCount = await buildContextChunks(
      eventId,
      blueprintId,
      chunksCycleId,
      blueprint,
      null, // Fetch from research_results table
      {
        supabase,
        openai,
        embedModel,
        genModel,
      }
    );
    console.log(`[context-gen] Chunks auto-regenerated: ${chunksCount} chunks`);

    // Mark as complete
    await updateAgentStatus(supabase, agentId, 'context_complete');
    console.log(`[context-gen] All downstream components regenerated successfully`);
  } catch (downstreamError: any) {
    console.error(`[context-gen] Error auto-regenerating downstream components: ${downstreamError.message}`);
    // Don't throw - research regeneration was successful, downstream can be regenerated manually
    await updateAgentStatus(supabase, agentId, 'researching');
  }

  return researchResults;
}

/**
 * Regenerate glossary stage only
 * Requires: Approved blueprint, research results
 */
export async function regenerateGlossaryStage(
  eventId: string,
  agentId: string,
  blueprintId: string,
  options: ContextGenerationOrchestratorOptions,
  researchResults?: ResearchResults
): Promise<number> {
  const { supabase, openai, genModel, embedModel } = options;

  console.log(`[context-gen] Regenerating glossary stage for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  // Fetch blueprint
  const { data: blueprintRecord, error: blueprintError } = await (supabase
    .from('context_blueprints') as any)
    .select('*')
    .eq('id', blueprintId)
    .single() as { data: any | null; error: any };

  if (blueprintError || !blueprintRecord) {
    throw new Error(`Failed to fetch blueprint: ${blueprintError?.message || 'Blueprint not found'}`);
  }

  const blueprint = blueprintRecord.blueprint as Blueprint;

  if (blueprintRecord.status !== 'approved') {
    throw new Error(`Blueprint must be approved to regenerate glossary. Current status: ${blueprintRecord.status}`);
  }

  // Create generation cycle
  const glossaryCycleId = await createGenerationCycle(
    supabase,
    eventId,
    agentId,
    blueprintId,
    'glossary',
    'glossary'
  );

  // Update status
  await updateAgentStatus(supabase, agentId, 'building_glossary');

  // Build glossary (fetches research from research_results table)
  const glossaryCount = await buildGlossary(
    eventId,
    blueprintId,
    glossaryCycleId,
    blueprint,
    null, // Fetch from research_results table
    {
      supabase,
      openai,
      genModel,
      embedModel,
    }
  );

  console.log(`[context-gen] Glossary regeneration completed: ${glossaryCount} terms`);

  return glossaryCount;
}

/**
 * Regenerate chunks stage only
 * Requires: Approved blueprint, research results
 */
export async function regenerateChunksStage(
  eventId: string,
  agentId: string,
  blueprintId: string,
  options: ContextGenerationOrchestratorOptions,
  researchResults?: ResearchResults
): Promise<number> {
  const { supabase, openai, embedModel, genModel } = options;

  console.log(`[context-gen] Regenerating chunks stage for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  // Fetch blueprint
  const { data: blueprintRecord, error: blueprintError } = await (supabase
    .from('context_blueprints') as any)
    .select('*')
    .eq('id', blueprintId)
    .single() as { data: any | null; error: any };

  if (blueprintError || !blueprintRecord) {
    throw new Error(`Failed to fetch blueprint: ${blueprintError?.message || 'Blueprint not found'}`);
  }

  const blueprint = blueprintRecord.blueprint as Blueprint;

  if (blueprintRecord.status !== 'approved') {
    throw new Error(`Blueprint must be approved to regenerate chunks. Current status: ${blueprintRecord.status}`);
  }

  // Create generation cycle
  const chunksCycleId = await createGenerationCycle(
    supabase,
    eventId,
    agentId,
    blueprintId,
    'chunks',
    'llm_chunks'
  );

  // Update status
  await updateAgentStatus(supabase, agentId, 'building_chunks');

  // Build chunks (fetches research from research_results table, preserves research chunks)
  const chunksCount = await buildContextChunks(
    eventId,
    blueprintId,
    chunksCycleId,
    blueprint,
    null, // Fetch from research_results table
    {
      supabase,
      openai,
      embedModel,
      genModel,
    }
  );

  console.log(`[context-gen] Chunks regeneration completed: ${chunksCount} chunks`);

  // Update to context_complete
  await updateAgentStatus(supabase, agentId, 'context_complete');
  // Blueprint status stays 'approved'

  return chunksCount;
}
