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
import { Exa } from 'exa-js';
import { Blueprint } from './blueprint-generator';
import { buildGlossary, GlossaryBuilderOptions, ResearchResults } from './glossary-builder';
import { buildContextChunks, ChunksBuilderOptions } from './chunks-builder';
import {
  STUB_RESEARCH_SYSTEM_PROMPT,
  createStubResearchUserPrompt,
} from './prompts';
import {
  calculateOpenAICost,
  calculateExaSearchCost,
  calculateExaResearchCost,
  calculateExaAnswerCost,
  getPricingVersion,
} from './pricing-config';

export interface ContextGenerationOrchestratorOptions {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  exaApiKey?: string; // Optional Exa API key for research
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
    metadata?: any; // For storing cost data and other metadata
  }
): Promise<void> {
  const updateData: any = { ...updates };
  if (updates.status === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  // If metadata is provided, merge with existing metadata
  if (updates.metadata !== undefined) {
    // Fetch existing metadata first
    const { data: existingCycle } = await (supabase
      .from('generation_cycles') as any)
      .select('metadata')
      .eq('id', cycleId)
      .single();

    const existingMetadata = existingCycle?.metadata || {};
    updateData.metadata = { ...existingMetadata, ...updates.metadata };
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
      { supabase, openai, genModel, exaApiKey: options.exaApiKey }
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
    const glossaryResult = await buildGlossary(
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
        exaApiKey: options.exaApiKey,
      }
    );

    console.log(`[context-gen] Glossary built: ${glossaryResult.termCount} terms (cost: $${(glossaryResult.costBreakdown.openai.total + glossaryResult.costBreakdown.exa.total).toFixed(4)})`);

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
    const chunksResult = await buildContextChunks(
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

    console.log(`[context-gen] Context chunks built: ${chunksResult.chunkCount} chunks (cost: $${chunksResult.costBreakdown.openai.total.toFixed(4)})`);

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
 * Uses Exa API for deep research queries
 */
async function executeResearchPlan(
  eventId: string,
  blueprintId: string,
  blueprint: Blueprint,
  generationCycleId: string,
  options: { supabase: ReturnType<typeof createClient>; openai: OpenAI; genModel: string; exaApiKey?: string }
): Promise<ResearchResults> {
  const { supabase, openai, genModel, exaApiKey } = options;
  const queries = blueprint.research_plan.queries || [];

  console.log(`[research] ========================================`);
  console.log(`[research] Starting research plan execution`);
  console.log(`[research] Total queries: ${queries.length}`);
  console.log(`[research] Event ID: ${eventId}, Blueprint ID: ${blueprintId}, Cycle ID: ${generationCycleId}`);
  console.log(`[research] ========================================`);

  const chunks: ResearchResults['chunks'] = [];
  const insertedCount = { value: 0 }; // Use object to allow mutation in helper function

  // Initialize cost tracking
  const costBreakdown = {
    openai: {
      total: 0,
      chat_completions: [] as Array<{ cost: number; usage: any; model: string }>,
    },
    exa: {
      total: 0,
      search: { cost: 0, queries: 0 },
      research: { cost: 0, queries: 0, usage: { searches: 0, pages: 0, tokens: 0 } },
      answer: { cost: 0, queries: 0 },
    },
  };

  // Initialize Exa client if API key is provided
  const exa = exaApiKey ? new Exa(exaApiKey) : null;
  if (!exa && queries.some(q => q.api === 'exa')) {
    console.warn(`[research] ⚠️  Exa API key not provided, but ${queries.filter(q => q.api === 'exa').length} Exa queries found. Falling back to LLM stub.`);
  }
  
  const exaQueries = queries.filter(q => q.api === 'exa').length;
  const wikipediaQueries = queries.filter(q => q.api === 'wikipedia').length;
  console.log(`[research] Query breakdown: ${exaQueries} Exa queries, ${wikipediaQueries} Wikipedia queries`);

  // Update cycle to processing
  await updateGenerationCycle(supabase, generationCycleId, {
    status: 'processing',
    progress_total: queries.length,
  });

  // Process queries
  for (let i = 0; i < queries.length; i++) {
    const queryItem = queries[i];
    const queryNumber = i + 1;
    const queryProgress = `[${queryNumber}/${queries.length}]`;
    
    console.log(`[research] ${queryProgress} Starting query: "${queryItem.query}" (API: ${queryItem.api}, Priority: ${queryItem.priority})`);
    
    try {
      if (queryItem.api === 'wikipedia') {
        // Wikipedia API implementation
        console.log(`[research] ${queryProgress} Executing Wikipedia API request for: ${queryItem.query}`);
        const startTime = Date.now();
        
        try {
          const wikipediaChunks = await executeWikipediaSearch(
            queryItem.query,
            supabase,
            eventId,
            blueprintId,
            generationCycleId
          );
          
          const duration = Date.now() - startTime;
          
          for (const chunk of wikipediaChunks) {
            insertedCount.value++;
            chunks.push(chunk);
          }
          
          console.log(`[research] ${queryProgress} ✓ Wikipedia API success: ${wikipediaChunks.length} chunks created in ${duration}ms for query: "${queryItem.query}"`);
        } catch (wikipediaError: any) {
          const duration = Date.now() - startTime;
          console.error(`[research] ${queryProgress} ✗ Wikipedia API FAILURE for query "${queryItem.query}":`, {
            error: wikipediaError.message,
            stack: wikipediaError.stack,
            duration: `${duration}ms`,
            statusCode: wikipediaError.status || wikipediaError.statusCode || 'N/A',
            response: wikipediaError.response ? JSON.stringify(wikipediaError.response).substring(0, 200) : 'N/A',
          });
          // Continue with other queries even if one fails
        }
        
        // Update progress after Wikipedia query
        await updateGenerationCycle(supabase, generationCycleId, {
          progress_current: queryNumber,
        });
        continue;
      } else if (queryItem.api === 'exa') {
        if (!exa) {
          // Fallback to stub if Exa API key not available
          console.warn(`[research] ${queryProgress} Exa API key not available - using LLM stub fallback for query: "${queryItem.query}"`);
          const startTime = Date.now();
          
          try {
            const stubChunks = await generateStubResearchChunks(queryItem.query, openai, genModel, costBreakdown);
            const duration = Date.now() - startTime;
            console.log(`[research] ${queryProgress} LLM stub generated ${stubChunks.length} chunks in ${duration}ms for query: "${queryItem.query}"`);
          
          for (const chunkText of stubChunks) {
            const metadata = {
              api: 'exa',
              query: queryItem.query,
              quality_score: 0.7,
            };

            const { error } = await (supabase
              .from('research_results') as any)
              .insert({
                event_id: eventId,
                blueprint_id: blueprintId,
                generation_cycle_id: generationCycleId,
                query: queryItem.query,
                api: 'llm_stub',
                content: chunkText,
                quality_score: metadata.quality_score,
                metadata: metadata,
                is_active: true,
                version: 1,
              });

            if (error) {
              console.error(`[research] ${queryProgress} Database error storing stub result: ${error.message}`);
            } else {
              insertedCount.value++;
              chunks.push({
                text: chunkText,
                source: 'research_stub',
                metadata,
              });
            }
          }
          } catch (stubError: any) {
            console.error(`[research] ${queryProgress} ✗ LLM stub generation FAILURE for query "${queryItem.query}":`, {
              error: stubError.message,
              stack: stubError.stack,
            });
          }
        } else {
          // Use /research endpoint for high-priority queries (priority 1-2)
          if (queryItem.priority <= 2) {
            console.log(`[research] ${queryProgress} Using Exa /research endpoint for high-priority query (priority ${queryItem.priority}): "${queryItem.query}"`);
            const startTime = Date.now();
            
            try {
              // Create comprehensive research task
              // OPTIMIZATION: Use outputSchema to constrain scope and reduce searches/pages
              // OPTIMIZATION: Make instructions explicit and scoped per Exa best practices
              console.log(`[research] ${queryProgress} Creating Exa research task...`);
              
              // Constrain output with schema to reduce cost (Exa best practice: 1-5 root fields)
              // This helps the agent understand scope and reduces unnecessary searches/page reads
              const outputSchema = {
                type: 'object',
                required: ['summary', 'keyPoints'],
                properties: {
                  summary: {
                    type: 'string',
                    description: 'A comprehensive summary (500-1000 words) covering the main topic'
                  },
                  keyPoints: {
                    type: 'array',
                    items: { type: 'string' },
                    maxItems: 10,
                    description: 'Key insights, developments, or findings (1-2 sentences each)'
                  }
                },
                additionalProperties: false
              };
              
              // Make instructions explicit and scoped (Exa best practice)
              // Specify: (1) what information (2) how to find it (3) how to compose report
              const instructions = `Research the topic: "${queryItem.query}"

OBJECTIVE: Provide a structured summary with key points suitable for AI context building.

WHAT TO FIND:
- Latest developments and current state (2023-2025 focus)
- Industry standards and best practices
- Key insights and practical applications
- Relevant technical details and methodologies

HOW TO RESEARCH:
- Use 3-5 targeted searches to find authoritative sources
- Focus on recent, high-quality publications and official documentation
- Prioritize comprehensive overview sources over narrow niche articles

HOW TO COMPOSE:
- Write a concise summary (500-1000 words) synthesizing findings
- Extract 8-10 key points as separate insights
- Include citations for important claims
- Focus on actionable information relevant to the topic`;

              const research = await exa.research.create({
                model: 'exa-research', // Use standard model (exa-research-pro is 2x more expensive)
                instructions: instructions,
                outputSchema: outputSchema, // Constrains agent scope, reduces searches/pages
              });

              console.log(`[research] ${queryProgress} Exa research task created: ${research.researchId}, polling for completion (timeout: 2min, polling every 5s)...`);
              console.log(`[research] ${queryProgress} Note: Research uses variable pricing ($5/1k searches, $5/1k pages, $5/1M reasoning tokens). OutputSchema helps constrain scope.`);

              // Poll until research is completed
              // OPTIMIZATION: Reduced timeout to 2 minutes (typical p50=45s, p90=90s for exa-research)
              // OPTIMIZATION: Poll every 5 seconds to reduce overhead (status checks are not billable per docs)
              // Note: You are ONLY charged for tasks that complete successfully (per Exa docs)
              const pollStartTime = Date.now();
              const completedResearch = await exa.research.pollUntilFinished(research.researchId, {
                timeoutMs: 120000, // 2 minutes timeout (p90 for exa-research is 90s, so 2min should catch most)
                pollInterval: 5000, // Poll every 5 seconds (status checks are not billable, but reduce overhead)
                events: false, // Don't include events for now
              });
              const pollDuration = Date.now() - pollStartTime;

              if (completedResearch.status === 'completed' && completedResearch.output) {
                console.log(`[research] ${queryProgress} ✓ Exa /research completed successfully in ${pollDuration}ms for query: "${queryItem.query}"`);
                
                // Extract structured output from research (with outputSchema, it's JSON)
                let researchData: any;
                if (typeof completedResearch.output === 'string') {
                  try {
                    researchData = JSON.parse(completedResearch.output);
                  } catch {
                    // If not JSON, treat as plain text
                    researchData = { summary: completedResearch.output, keyPoints: [] };
                  }
                } else {
                  researchData = completedResearch.output;
                }
                
                // Extract summary and key points from structured output
                const summary = researchData.summary || researchData.content || researchData.text || '';
                const keyPoints = researchData.keyPoints || [];
                
                if (!summary || summary.length < 50) {
                  console.warn(`[research] ${queryProgress} Exa /research output is empty or too short (${summary?.length || 0} chars) for query: "${queryItem.query}" - falling back to /search`);
                  // Fallback to /search
                  await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount, costBreakdown);
                  continue;
                }
                
                // Combine summary and key points into research text
                const researchText = summary + (keyPoints.length > 0 ? '\n\nKey Points:\n' + keyPoints.map((kp: string, i: number) => `${i + 1}. ${kp}`).join('\n') : '');
                
                // Split comprehensive research output into chunks
                const textChunks = chunkTextContent(researchText, 200, 400);
                
                for (const chunkText of textChunks) {
                  const metadata = {
                    api: 'exa',
                    query: queryItem.query,
                    research_id: completedResearch.researchId,
                    method: 'research',
                    quality_score: 0.95, // High quality for comprehensive research
                  };

                  const { error } = await (supabase
                    .from('research_results') as any)
                    .insert({
                      event_id: eventId,
                      blueprint_id: blueprintId,
                      generation_cycle_id: generationCycleId,
                      query: queryItem.query,
                      api: 'exa',
                      content: chunkText,
                      quality_score: metadata.quality_score,
                      metadata: metadata,
                      is_active: true,
                      version: 1,
                    });

                  if (error) {
                    console.error(`[research] Error storing research result: ${error.message}`);
                  } else {
                    insertedCount.value++;
                    chunks.push({
                      text: chunkText,
                      source: 'exa_research',
                      metadata,
                    });
                  }
                }

                const totalDuration = Date.now() - startTime;
                console.log(`[research] ${queryProgress} ✓ Stored ${textChunks.length} chunks from Exa /research in ${totalDuration}ms for query: "${queryItem.query}"`);
                
                // Track Exa research cost (estimate based on typical usage)
                // Note: Exa research cost is variable, we estimate based on typical usage
                // If Exa provides usage data in response, we can use that
                if (costBreakdown) {
                  // Estimate: typical research uses ~5 searches, ~3 pages, ~50k tokens
                  const estimatedUsage = {
                    searches: 5,
                    pages: 3,
                    tokens: 50000,
                  };
                  const researchCost = calculateExaResearchCost(estimatedUsage);
                  costBreakdown.exa.total += researchCost;
                  costBreakdown.exa.research.cost += researchCost;
                  costBreakdown.exa.research.queries += 1;
                  costBreakdown.exa.research.usage.searches += estimatedUsage.searches;
                  costBreakdown.exa.research.usage.pages += estimatedUsage.pages;
                  costBreakdown.exa.research.usage.tokens += estimatedUsage.tokens;
                }
              } else if (completedResearch.status === 'failed') {
                const totalDuration = Date.now() - startTime;
                console.error(`[research] ${queryProgress} ✗ Exa /research task FAILED for query "${queryItem.query}":`, {
                  status: completedResearch.status,
                  researchId: research.researchId,
                  duration: `${totalDuration}ms`,
                  error: (completedResearch as any).error || 'Unknown error',
                });
                // Fallback to /search
                console.log(`[research] ${queryProgress} Falling back to Exa /search for query: "${queryItem.query}"`);
                await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount, costBreakdown);
              } else {
                const totalDuration = Date.now() - startTime;
                console.warn(`[research] ${queryProgress} Exa /research task ended with unexpected status: ${completedResearch.status} (duration: ${totalDuration}ms) for query: "${queryItem.query}"`);
                // Fallback to /search
                console.log(`[research] ${queryProgress} Falling back to Exa /search for query: "${queryItem.query}"`);
                await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount, costBreakdown);
              }
            } catch (researchError: any) {
              const duration = Date.now() - startTime;
              console.error(`[research] ${queryProgress} ✗ Exa /research endpoint FAILURE for query "${queryItem.query}":`, {
                error: researchError.message,
                stack: researchError.stack,
                duration: `${duration}ms`,
                statusCode: researchError.status || researchError.statusCode || 'N/A',
                response: researchError.response ? JSON.stringify(researchError.response).substring(0, 200) : 'N/A',
                code: researchError.code || 'N/A',
              });
              console.log(`[research] ${queryProgress} Attempting fallback to Exa /search for query: "${queryItem.query}"`);
              // Fallback to /search
              try {
                await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount, costBreakdown);
              } catch (searchError: any) {
                console.error(`[research] ${queryProgress} ✗ Fallback Exa /search also FAILED for query "${queryItem.query}":`, {
                  error: searchError.message,
                  stack: searchError.stack,
                  statusCode: searchError.status || searchError.statusCode || 'N/A',
                  code: searchError.code || 'N/A',
                });
              }
            }
          } else {
            // Use /search endpoint for priority 3+ queries (current implementation)
            console.log(`[research] ${queryProgress} Using Exa /search endpoint for query (priority ${queryItem.priority}): "${queryItem.query}"`);
            const startTime = Date.now();
            
            try {
              await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount, costBreakdown);
              const duration = Date.now() - startTime;
              console.log(`[research] ${queryProgress} ✓ Exa /search completed in ${duration}ms for query: "${queryItem.query}"`);
            } catch (searchError: any) {
              const duration = Date.now() - startTime;
              console.error(`[research] ${queryProgress} ✗ Exa /search FAILURE for query "${queryItem.query}":`, {
                error: searchError.message,
                stack: searchError.stack,
                duration: `${duration}ms`,
                statusCode: searchError.status || searchError.statusCode || 'N/A',
                code: searchError.code || 'N/A',
              });
            }
          }
        }
      }

      // Update progress after successful query processing
      await updateGenerationCycle(supabase, generationCycleId, {
        progress_current: queryNumber,
      });
      
      console.log(`[research] ${queryProgress} Query processing complete. Total chunks so far: ${insertedCount.value}`);
    } catch (error: any) {
      console.error(`[research] ${queryProgress} ✗ UNEXPECTED ERROR processing query "${queryItem.query}":`, {
        error: error.message,
        stack: error.stack,
        type: error.constructor?.name || 'Unknown',
      });
      // Continue with other queries
      await updateGenerationCycle(supabase, generationCycleId, {
        progress_current: queryNumber,
      });
    }
  }

  // Calculate total cost
  const totalCost = costBreakdown.openai.total + costBreakdown.exa.total;
  
  console.log(`[research] ========================================`);
  console.log(`[research] Research plan execution COMPLETE`);
  console.log(`[research] Total cost: $${totalCost.toFixed(4)} (OpenAI: $${costBreakdown.openai.total.toFixed(4)}, Exa: $${costBreakdown.exa.total.toFixed(4)})`);
  
  // Store cost data in generation cycle metadata
  const costMetadata = {
    cost: {
      total: totalCost,
      currency: 'USD',
      breakdown: {
        openai: {
          total: costBreakdown.openai.total,
          chat_completions: costBreakdown.openai.chat_completions,
        },
        exa: {
          total: costBreakdown.exa.total,
          search: costBreakdown.exa.search,
          research: costBreakdown.exa.research,
          answer: costBreakdown.exa.answer,
        },
      },
      tracked_at: new Date().toISOString(),
      pricing_version: getPricingVersion(),
    },
  };

  // Mark cycle as completed with cost metadata
  await updateGenerationCycle(supabase, generationCycleId, {
    status: 'completed',
    progress_current: queries.length,
    metadata: costMetadata,
  });

  console.log(`[research] ========================================`);
  console.log(`[research] Total queries processed: ${queries.length}`);
  console.log(`[research] Total chunks created: ${insertedCount.value}`);
  console.log(`[research] Results stored in database: ${insertedCount.value}`);
  console.log(`[research] ========================================`);
  
  return { chunks };
}

/**
 * Generate stub research chunks (fallback when Exa API not available)
 */
async function generateStubResearchChunks(
  query: string,
  openai: OpenAI,
  genModel: string,
  costBreakdown?: { openai: { total: number; chat_completions: Array<{ cost: number; usage: any; model: string }> } }
): Promise<string[]> {
  try {
    // Some models (like o1, o1-preview, o1-mini, gpt-5) don't support custom temperature values
    const modelLower = genModel.toLowerCase();
    const isO1Model = modelLower.startsWith('o1');
    const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
    const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
    const supportsCustomTemperature = !onlySupportsDefaultTemp;

    const requestOptions: any = {
      model: genModel,
      messages: [
        {
          role: 'system',
          content: STUB_RESEARCH_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: createStubResearchUserPrompt(query),
        },
      ],
      response_format: { type: 'json_object' },
    };

    if (supportsCustomTemperature) {
      requestOptions.temperature = 0.7;
    }

    const response = await openai.chat.completions.create(requestOptions);

    // Track cost
    if (costBreakdown && response.usage) {
      const usage = response.usage;
      const cost = calculateOpenAICost(usage, genModel, false);
      costBreakdown.openai.total += cost;
      costBreakdown.openai.chat_completions.push({
        cost,
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        },
        model: genModel,
      });
    }

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
 * Chunk text content into smaller pieces (200-400 words each)
 * Attempts to split on sentence boundaries
 */
function chunkTextContent(text: string, minWords: number, maxWords: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const word of words) {
    currentChunk.push(word);
    currentWordCount++;

    // Check if we should finalize this chunk
    if (currentWordCount >= minWords) {
      // Try to end on sentence boundary if we're past min words
      if (currentWordCount >= maxWords || word.match(/[.!?]$/)) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
        currentWordCount = 0;
      }
    }
  }

  // Add remaining chunk if any
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks.length > 0 ? chunks : [text]; // Fallback to original text if chunking fails
}

/**
 * Execute Exa search and store results
 * Extracted as helper function for reuse
 */
async function executeExaSearch(
  queryItem: { query: string },
  exa: Exa,
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  chunks: ResearchResults['chunks'],
  insertedCount: { value: number },
  costBreakdown?: { exa: { total: number; search: { cost: number; queries: number } } }
): Promise<void> {
  const startTime = Date.now();
  
  try {
    console.log(`[research] Exa /search: Initiating search for "${queryItem.query}"...`);
    
    // Track cost
    if (costBreakdown) {
      const searchCost = calculateExaSearchCost(1);
      costBreakdown.exa.total += searchCost;
      costBreakdown.exa.search.cost += searchCost;
      costBreakdown.exa.search.queries += 1;
    }
    
    // Search and get contents from Exa
    // Using search() with contents option (searchAndContents is deprecated)
    const searchResults = await exa.search(queryItem.query, {
      contents: { text: true },
      numResults: 5, // Get top 5 results per query
    });

    const searchDuration = Date.now() - startTime;
    
    if (!searchResults.results || searchResults.results.length === 0) {
      console.warn(`[research] Exa /search: No results found for query "${queryItem.query}" (duration: ${searchDuration}ms)`);
      return;
    }
    
    console.log(`[research] Exa /search: Received ${searchResults.results.length} results in ${searchDuration}ms for query: "${queryItem.query}"`);

    // Process each result and create chunks
    let processedResults = 0;
    let skippedResults = 0;
    
    for (const result of searchResults.results) {
      if (!result.text) {
        console.warn(`[research] Exa /search: Result missing text content for URL: ${result.url}`);
        skippedResults++;
        continue;
      }
      
      processedResults++;

      // Split long text into chunks (200-400 words each)
      const textChunks = chunkTextContent(result.text, 200, 400);
      
      for (const chunkText of textChunks) {
        const metadata = {
          api: 'exa',
          query: queryItem.query,
          url: result.url,
          title: result.title || null,
          author: result.author || null,
          published_date: result.publishedDate || null,
          quality_score: calculateQualityScore(result, chunkText),
        };

        const { error } = await (supabase
          .from('research_results') as any)
          .insert({
            event_id: eventId,
            blueprint_id: blueprintId,
            generation_cycle_id: generationCycleId,
            query: queryItem.query,
            api: 'exa',
            content: chunkText,
            source_url: result.url,
            quality_score: metadata.quality_score,
            metadata: metadata,
            is_active: true,
            version: 1,
          });

        if (error) {
          console.error(`[research] Exa /search: Database error storing result for "${queryItem.query}": ${error.message}`);
        } else {
          insertedCount.value++;
          chunks.push({
            text: chunkText,
            source: 'exa',
            metadata,
          });
        }
      }
    }
    
    const totalDuration = Date.now() - startTime;
    console.log(`[research] Exa /search: Processed ${processedResults}/${searchResults.results.length} results (${skippedResults} skipped), created ${insertedCount.value} chunks in ${totalDuration}ms for query: "${queryItem.query}"`);
  } catch (exaError: any) {
    const duration = Date.now() - startTime;
    console.error(`[research] ✗ Exa /search API FAILURE for query "${queryItem.query}":`, {
      error: exaError.message,
      stack: exaError.stack,
      duration: `${duration}ms`,
      statusCode: exaError.status || exaError.statusCode || 'N/A',
      code: exaError.code || 'N/A',
      response: exaError.response ? JSON.stringify(exaError.response).substring(0, 300) : 'N/A',
      type: exaError.constructor?.name || 'Unknown',
    });
    throw exaError; // Re-throw to allow caller to handle
  }
}

/**
 * Execute Wikipedia search and store results
 * Uses Wikipedia MediaWiki API (free, no API key required)
 */
async function executeWikipediaSearch(
  query: string,
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  blueprintId: string,
  generationCycleId: string
): Promise<ResearchResults['chunks']> {
  const chunks: ResearchResults['chunks'] = [];
  const startTime = Date.now();
  
  try {
    // Step 1: Search Wikipedia for relevant articles
    console.log(`[research] Wikipedia: Searching for articles matching "${query}"...`);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
    
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text().catch(() => 'Unable to read response');
      throw new Error(`Wikipedia search API returned ${searchResponse.status}: ${errorText.substring(0, 200)}`);
    }
    
    const searchData = await searchResponse.json() as {
      query?: {
        search?: Array<{
          title: string;
          pageid: number;
          snippet: string;
        }>;
      };
    };
    const searchResults = searchData.query?.search || [];
    const searchDuration = Date.now() - startTime;
    
    if (searchResults.length === 0) {
      console.warn(`[research] Wikipedia: No articles found for query "${query}" (duration: ${searchDuration}ms)`);
      return chunks;
    }
    
    console.log(`[research] Wikipedia: Found ${searchResults.length} articles in ${searchDuration}ms for query: "${query}"`);
    
    // Step 2: Fetch content for top results
    let processedArticles = 0;
    let skippedArticles = 0;
    
    for (const result of searchResults) {
      const articleStartTime = Date.now();
      try {
        // Use Wikipedia REST API for page summaries (simpler and faster)
        const pageTitle = encodeURIComponent(result.title.replace(/ /g, '_'));
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;
        
        const summaryResponse = await fetch(summaryUrl);
        
        if (!summaryResponse.ok) {
          const errorText = await summaryResponse.text().catch(() => 'Unable to read response');
          console.warn(`[research] Wikipedia: Failed to fetch summary for "${result.title}" (status: ${summaryResponse.status}): ${errorText.substring(0, 100)}`);
          skippedArticles++;
          continue;
        }
        
        const summaryData = await summaryResponse.json() as {
          extract?: string;
          extract_html?: string;
          title?: string;
          content_urls?: {
            desktop?: {
              page?: string;
            };
          };
          thumbnail?: {
            source?: string;
          };
          coordinates?: {
            lat?: number;
            lon?: number;
          };
        };
        
        // Combine extract and extract_html for better content
        let content = summaryData.extract || '';
        if (summaryData.extract_html) {
          // Strip HTML tags for plain text
          content = summaryData.extract_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        
        if (!content || content.length < 50) {
          console.warn(`[research] Wikipedia: Article "${result.title}" has insufficient content (${content?.length || 0} chars)`);
          skippedArticles++;
          continue;
        }
        
        const articleDuration = Date.now() - articleStartTime;
        processedArticles++;
        
        // Split content into chunks (200-400 words each)
        const textChunks = chunkTextContent(content, 200, 400);
        
        for (const chunkText of textChunks) {
          const metadata = {
            api: 'wikipedia',
            query: query,
            title: result.title,
            url: summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${pageTitle}`,
            page_id: result.pageid,
            quality_score: calculateWikipediaQualityScore(summaryData, chunkText),
          };
          
          const { error } = await (supabase
            .from('research_results') as any)
            .insert({
              event_id: eventId,
              blueprint_id: blueprintId,
              generation_cycle_id: generationCycleId,
              query: query,
              api: 'wikipedia',
              content: chunkText,
              source_url: metadata.url,
              quality_score: metadata.quality_score,
              metadata: metadata,
              is_active: true,
              version: 1,
            });
          
          if (error) {
            console.error(`[research] Wikipedia: Database error storing result for article "${result.title}": ${error.message}`);
          } else {
            chunks.push({
              text: chunkText,
              source: 'wikipedia',
              metadata,
            });
          }
        }
        
        console.log(`[research] Wikipedia: Processed article "${result.title}" - ${textChunks.length} chunks created in ${articleDuration}ms`);
      } catch (articleError: any) {
        const articleDuration = Date.now() - articleStartTime;
        console.warn(`[research] Wikipedia: Error processing article "${result.title}" (duration: ${articleDuration}ms):`, {
          error: articleError.message,
          stack: articleError.stack,
          statusCode: articleError.status || articleError.statusCode || 'N/A',
        });
        skippedArticles++;
      }
    }
    
    const totalDuration = Date.now() - startTime;
    console.log(`[research] Wikipedia: Completed query "${query}" - ${processedArticles}/${searchResults.length} articles processed (${skippedArticles} skipped), ${chunks.length} chunks created in ${totalDuration}ms`);

    return chunks;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[research] ✗ Wikipedia API FAILURE for query "${query}":`, {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      statusCode: error.status || error.statusCode || 'N/A',
      type: error.constructor?.name || 'Unknown',
    });
    throw error;
  }
}

/**
 * Calculate quality score for Wikipedia content
 */
function calculateWikipediaQualityScore(articleData: any, chunkText: string): number {
  let score = 0.6; // Base score (Wikipedia is generally reliable)
  
  // Boost for substantial content
  const wordCount = chunkText.split(/\s+/).length;
  if (wordCount > 100) {
    score += 0.1;
  }
  
  // Boost if article has thumbnail (often indicates well-maintained article)
  if (articleData.thumbnail) {
    score += 0.1;
  }
  
  // Boost if article has coordinates (often indicates factual accuracy)
  if (articleData.coordinates) {
    score += 0.1;
  }
  
  // Boost for longer extract (more comprehensive)
  if (articleData.extract && articleData.extract.length > 500) {
    score += 0.1;
  }
  
  // Cap at 1.0
  return Math.min(score, 1.0);
}

/**
 * Calculate quality score for a research result chunk
 * Based on source metadata and content characteristics
 */
function calculateQualityScore(result: any, chunkText: string): number {
  let score = 0.5; // Base score

  // Boost for having a title
  if (result.title && result.title.length > 10) {
    score += 0.1;
  }

  // Boost for having author
  if (result.author) {
    score += 0.1;
  }

  // Boost for recent publication date
  if (result.publishedDate) {
    try {
      const published = new Date(result.publishedDate);
      const now = new Date();
      const daysSincePublished = (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24);
      
      // Recent content (within 2 years) gets higher score
      if (daysSincePublished < 730) {
        score += 0.1;
      }
    } catch (e) {
      // Ignore date parsing errors
    }
  }

  // Boost for substantial content (more than 100 words)
  const wordCount = chunkText.split(/\s+/).length;
  if (wordCount > 100) {
    score += 0.1;
  }

  // Cap at 1.0
  return Math.min(score, 1.0);
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
  // Only allow: 'generating', 'approved', 'error'
  // 'executing' and 'completed' removed - tracked via agent status and generation_cycles
  const allowedStatuses = ['generating', 'approved', 'error'];
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
    { supabase, openai, genModel, exaApiKey: options.exaApiKey }
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
        embedModel: options.embedModel,
        exaApiKey: options.exaApiKey,
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
    const chunksResult = await buildContextChunks(
      eventId,
      blueprintId,
      chunksCycleId,
      blueprint,
      null, // Fetch from research_results table
      {
        supabase,
        openai,
        embedModel: options.embedModel,
        genModel,
      }
    );
    console.log(`[context-gen] Chunks auto-regenerated: ${chunksResult.chunkCount} chunks (cost: $${chunksResult.costBreakdown.openai.total.toFixed(4)})`);

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
      exaApiKey: options.exaApiKey,
    }
  );

  console.log(`[context-gen] Glossary regeneration completed: ${glossaryCount.termCount} terms`);

  return glossaryCount.termCount;
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
  const chunksResult = await buildContextChunks(
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

  console.log(`[context-gen] Chunks regeneration completed: ${chunksResult.chunkCount} chunks (cost: $${chunksResult.costBreakdown.openai.total.toFixed(4)})`);

  // Update to context_complete
  await updateAgentStatus(supabase, agentId, 'context_complete');
  // Blueprint status stays 'approved'

  return chunksResult.chunkCount;
}
