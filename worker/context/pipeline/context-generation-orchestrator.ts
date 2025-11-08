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

import type OpenAI from 'openai';
import type { ResearchResults } from './glossary/types';
import { runGlossaryPhase } from './orchestrator/glossary-phase';
import { runChunksPhase } from './orchestrator/chunks-phase';
import { fetchBlueprintRow, type WorkerSupabaseClient } from './orchestrator/supabase-orchestrator';
import type { GenerationContext } from './orchestrator/phase-context';
import { StatusManager } from './orchestrator/status-manager';
import { runResearchPhase } from './orchestrator/research-phase';

export interface ContextGenerationOrchestratorOptions {
  supabase: WorkerSupabaseClient;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  exaApiKey?: string; // Optional Exa API key for research
}

/**
 * Create a generation cycle record
 */
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
  const statusManager = new StatusManager(supabase);
  const generationContext: GenerationContext = { eventId, agentId, blueprintId };

  console.log(`[context-gen] Executing context generation for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  try {
    // 1. Fetch blueprint
    const { blueprint } = await fetchBlueprintRow(supabase, blueprintId);

    // 2. Update status to 'researching'
    await statusManager.markAgentStatus(agentId, 'researching');
    // Blueprint status stays 'approved' - execution tracked via agent status and generation_cycles

    // 3. Create research generation cycle
    const researchCycleId = await statusManager.createCycle(generationContext, 'research', 'research');

    // 4. Execute research plan and store in research_results
    console.log(`[context-gen] Executing research plan with ${blueprint.research_plan.queries.length} queries`);
    const researchResults = await runResearchPhase(
      generationContext,
      blueprint,
      researchCycleId,
      { supabase, openai, genModel, exaApiKey: options.exaApiKey, statusManager }
    );

    console.log(`[context-gen] Research completed: ${researchResults.chunks.length} chunks found`);

    // 5. Create glossary generation cycle
    const glossaryCycleId = await statusManager.createCycle(generationContext, 'glossary', 'glossary');

    // 6. Update status to 'building_glossary'
    await statusManager.markAgentStatus(agentId, 'building_glossary');

    // 7. Build glossary (fetches research from research_results table)
    const glossaryResult = await runGlossaryPhase(
      generationContext,
      blueprint,
      glossaryCycleId,
      {
        supabase,
        openai,
        genModel,
        embedModel,
        exaApiKey: options.exaApiKey,
        statusManager,
      }
    );

    console.log(`[context-gen] Glossary built: ${glossaryResult.termCount} terms (cost: $${(glossaryResult.costBreakdown.openai.total + glossaryResult.costBreakdown.exa.total).toFixed(4)})`);

    // 8. Create chunks generation cycle
    const chunksCycleId = await statusManager.createCycle(generationContext, 'chunks', 'llm_chunks');

    // 9. Update status to 'building_chunks'
    await statusManager.markAgentStatus(agentId, 'building_chunks');

    // 10. Build chunks (fetches research from research_results table)
    const chunksResult = await runChunksPhase(
      generationContext,
      blueprint,
      chunksCycleId,
      {
        supabase,
        openai,
        embedModel,
        genModel,
        statusManager,
      }
    );

    console.log(`[context-gen] Context chunks built: ${chunksResult.chunkCount} chunks (cost: $${chunksResult.costBreakdown.openai.total.toFixed(4)})`);

    // 8. Update status to 'context_complete'
    await statusManager.markAgentStatus(agentId, 'context_complete');
    // Blueprint status stays 'approved' - completion tracked via agent status

    console.log(`[context-gen] Context generation complete for event ${eventId}`);
  } catch (err: unknown) {
    console.error('[orchestrator] error:', String(err));
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
  const statusManager = new StatusManager(supabase);
  const generationContext: GenerationContext = { eventId, agentId, blueprintId };

  console.log(`[context-gen] Regenerating research stage for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  // Fetch blueprint
  const {
    record: blueprintRecord,
    blueprint,
  } = await fetchBlueprintRow(supabase, blueprintId);

  if (blueprintRecord.status !== 'approved') {
    throw new Error(`Blueprint must be approved to regenerate research. Current status: ${blueprintRecord.status}`);
  }

  // Create generation cycle first (we'll use it to filter what to delete)
  const researchCycleId = await statusManager.createCycle(generationContext, 'research', 'research');

  // Update status
  await statusManager.markAgentStatus(agentId, 'researching');
  // Blueprint status stays 'approved'

  // Execute research and store in research_results
  const researchResults = await runResearchPhase(
    generationContext,
    blueprint,
    researchCycleId,
    { supabase, openai, genModel, exaApiKey: options.exaApiKey, statusManager }
  );

  console.log(`[context-gen] Research regeneration completed: ${researchResults.chunks.length} chunks found`);

  await statusManager.supersedeCycles(generationContext, ['research'], 'old research', researchCycleId);

  // Mark downstream components (glossary, chunks) cycles as superseded
  // Don't delete data - only mark cycles to prevent UI visualization and downstream access
  await statusManager.supersedeCycles(generationContext, ['glossary', 'chunks'], 'downstream glossary/chunks');

  console.log(`[context-gen] Downstream components (glossary, chunks) marked for regeneration`);

  // Automatically regenerate downstream components since research changed
  console.log(`[context-gen] Auto-regenerating downstream components after research regeneration`);
  
  try {
    // Regenerate glossary
    const glossaryCycleId = await statusManager.createCycle(generationContext, 'glossary', 'glossary');

    await statusManager.markAgentStatus(agentId, 'building_glossary');
    const glossaryResult = await runGlossaryPhase(
      generationContext,
      blueprint,
      glossaryCycleId,
      {
        supabase,
        openai,
        genModel,
        embedModel: options.embedModel,
        exaApiKey: options.exaApiKey,
        statusManager,
      }
    );
    console.log(`[context-gen] Glossary auto-regenerated: ${glossaryResult.termCount} terms`);

    // Regenerate chunks
    const chunksCycleId = await statusManager.createCycle(generationContext, 'chunks', 'llm_chunks');

    await statusManager.markAgentStatus(agentId, 'building_chunks');
    const chunksResult = await runChunksPhase(
      generationContext,
      blueprint,
      chunksCycleId,
      {
        supabase,
        openai,
        embedModel: options.embedModel,
        genModel,
        statusManager,
      }
    );
    console.log(`[context-gen] Chunks auto-regenerated: ${chunksResult.chunkCount} chunks (cost: $${chunksResult.costBreakdown.openai.total.toFixed(4)})`);

    // Mark as complete
    await statusManager.markAgentStatus(agentId, 'context_complete');
    console.log(`[context-gen] All downstream components regenerated successfully`);
  } catch (err: unknown) {
    console.error('[orchestrator] error:', String(err));
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
  _researchResults?: ResearchResults
): Promise<number> {
  const { supabase, openai, genModel, embedModel } = options;
  void _researchResults;

  console.log(`[context-gen] Regenerating glossary stage for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  const {
    record: blueprintRecord,
    blueprint,
  } = await fetchBlueprintRow(supabase, blueprintId);

  if (blueprintRecord.status !== 'approved') {
    throw new Error(`Blueprint must be approved to regenerate glossary. Current status: ${blueprintRecord.status}`);
  }

  const statusManager = new StatusManager(supabase);
  const generationContext: GenerationContext = { eventId, agentId, blueprintId };

  const glossaryCycleId = await statusManager.createCycle(generationContext, 'glossary', 'glossary');

  await statusManager.markAgentStatus(agentId, 'building_glossary');

  const glossaryResult = await runGlossaryPhase(generationContext, blueprint, glossaryCycleId, {
    supabase,
    openai,
    genModel,
    embedModel,
    exaApiKey: options.exaApiKey,
    statusManager,
  });

  console.log(`[context-gen] Glossary regeneration completed: ${glossaryResult.termCount} terms`);

  await statusManager.supersedeCycles(generationContext, ['glossary'], 'old glossary', glossaryCycleId);

  await statusManager.markAgentStatus(agentId, 'context_complete');

  return glossaryResult.termCount;
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
  _researchResults?: ResearchResults
): Promise<number> {
  const { supabase, openai, embedModel, genModel } = options;
  void _researchResults;

  console.log(`[context-gen] Regenerating chunks stage for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  const {
    record: blueprintRecord,
    blueprint,
  } = await fetchBlueprintRow(supabase, blueprintId);

  if (blueprintRecord.status !== 'approved') {
    throw new Error(`Blueprint must be approved to regenerate chunks. Current status: ${blueprintRecord.status}`);
  }

  const statusManager = new StatusManager(supabase);
  const generationContext: GenerationContext = { eventId, agentId, blueprintId };

  const chunksCycleId = await statusManager.createCycle(generationContext, 'chunks', 'llm_chunks');

  await statusManager.markAgentStatus(agentId, 'building_chunks');

  const chunksResult = await runChunksPhase(generationContext, blueprint, chunksCycleId, {
    supabase,
    openai,
    embedModel,
    genModel,
    statusManager,
  });

  console.log(`[context-gen] Chunks regeneration completed: ${chunksResult.chunkCount} chunks (cost: $${chunksResult.costBreakdown.openai.total.toFixed(4)})`);

  await statusManager.supersedeCycles(generationContext, ['chunks'], 'old chunks', chunksCycleId);

  await statusManager.markAgentStatus(agentId, 'context_complete');

  return chunksResult.chunkCount;
}
