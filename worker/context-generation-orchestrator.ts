/**
 * Context Generation Orchestrator
 * Orchestrates the execution of context generation blueprint
 * 
 * Flow:
 * 1. Execute research plan (Exa/Wikipedia)
 * 2. Build glossary
 * 3. Build chunks (ranked, up to 1000)
 * 4. Update status to 'context_complete'
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
    await updateBlueprintStatus(supabase, blueprintId, 'executing');

    // 3. Execute research plan
    console.log(`[context-gen] Executing research plan with ${blueprint.research_plan.queries.length} queries`);
    const researchResults = await executeResearchPlan(
      eventId,
      blueprint,
      { openai, genModel }
    );

    console.log(`[context-gen] Research completed: ${researchResults.chunks.length} chunks found`);

    // 4. Update status to 'building_glossary'
    await updateAgentStatus(supabase, agentId, 'building_glossary');

    // 5. Build glossary
    const glossaryCount = await buildGlossary(
      eventId,
      blueprint,
      researchResults,
      {
        supabase,
        openai,
        genModel,
        embedModel,
      }
    );

    console.log(`[context-gen] Glossary built: ${glossaryCount} terms`);

    // 6. Update status to 'building_chunks'
    await updateAgentStatus(supabase, agentId, 'building_chunks');

    // 7. Build chunks
    const chunksCount = await buildContextChunks(
      eventId,
      blueprint,
      researchResults,
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
    await updateBlueprintStatus(supabase, blueprintId, 'completed');

    console.log(`[context-gen] Context generation complete for event ${eventId}`);
  } catch (error: any) {
    console.error(`[context-gen] Error executing context generation: ${error.message}`);
    
    // Update status to error
    await updateAgentStatus(supabase, agentId, 'error').catch(() => {});
    await updateBlueprintStatus(supabase, blueprintId, 'error', error.message).catch(() => {});
    
    throw error;
  }
}

/**
 * Execute research plan from blueprint
 * Currently uses stub - Exa integration will be added in Step 7
 */
async function executeResearchPlan(
  eventId: string,
  blueprint: Blueprint,
  options: { openai: OpenAI; genModel: string }
): Promise<ResearchResults> {
  const { openai, genModel } = options;
  const queries = blueprint.research_plan.queries || [];

  console.log(`[research] Executing ${queries.length} research queries`);

  const chunks: ResearchResults['chunks'] = [];

  // Process queries (stub implementation - will be enhanced with Exa API in Step 7)
  for (const queryItem of queries) {
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
        chunks.push(...stubChunks.map(text => ({
          text,
          source: 'research_stub',
          metadata: {
            api: 'exa',
            query: queryItem.query,
            quality_score: 0.7, // Lower quality for stub
          },
        })));
      }
    } catch (error: any) {
      console.error(`[research] Error processing query "${queryItem.query}": ${error.message}`);
      // Continue with other queries
    }
  }

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
  const update: any = { status };
  if (errorMessage) {
    update.error_message = errorMessage;
  }
  if (status === 'completed') {
    update.completed_at = new Date().toISOString();
  } else if (status === 'executing') {
    update.execution_started_at = new Date().toISOString();
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
