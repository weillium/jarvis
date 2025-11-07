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
import { Exa } from 'exa-js';
import type { Blueprint } from './blueprint-generator';
import type { ResearchResults } from './glossary-builder';
import { buildGlossary } from './glossary-builder';
import { buildContextChunks } from './chunks-builder';
import { getPricingVersion } from './pricing-config';
import type { ResearchResultInsert } from '../../types';
import { chunkTextContent } from '../../lib/text/llm-prompt-chunking';
import {
  createGenerationCycle,
  fetchBlueprintRow,
  insertResearchResultRow,
  markGenerationCyclesSuperseded,
  updateAgentStatus,
  updateGenerationCycle,
  type WorkerSupabaseClient,
} from './orchestrator/supabase-orchestrator';
import {
  calculateWikipediaQualityScore,
  executeExaSearch,
  pollResearchTasks,
  type PendingResearchTask,
} from './orchestrator/exa-orchestrator';
import { generateStubResearchChunks } from './orchestrator/llm-orchestrator';

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

  console.log(`[context-gen] Executing context generation for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  try {
    // 1. Fetch blueprint
    const { blueprint } = await fetchBlueprintRow(supabase, blueprintId);

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
  } catch (err: unknown) {
    console.error('[orchestrator] error:', String(err));
  }
}

/**
 * Execute research plan from blueprint and store in research_results table
 * Uses Exa API for deep research queries
 * 
 * NEW APPROACH:
 * 1. Start all Exa /research tasks (fire-and-forget)
 * 2. Process Wikipedia and Exa /search queries immediately
 * 3. Poll for /research task completion in background (up to 5 minutes)
 * 4. Process results as they complete
 */
async function executeResearchPlan(
  eventId: string,
  blueprintId: string,
  blueprint: Blueprint,
  generationCycleId: string,
  options: { supabase: WorkerSupabaseClient; openai: OpenAI; genModel: string; exaApiKey?: string }
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
const pendingResearchTasks: PendingResearchTask[] = []; // Track async research tasks

type OpenAIChatCompletionCost = {
  cost: number;
  usage: {
    prompt_tokens: number;
    completion_tokens?: number;
    total_tokens: number;
  };
  model: string;
};

  // Initialize cost tracking
  const costBreakdown = {
    openai: {
      total: 0,
      chat_completions: [] as OpenAIChatCompletionCost[],
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
        } catch (err: unknown) {
          console.error('[orchestrator] error:', String(err));
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
            const qualityScore = 0.7;
            const metadata: ResearchResultInsert['metadata'] = {
              api: 'exa',
              query: queryItem.query,
              quality_score: qualityScore,
            };

            const insertResult = await insertResearchResultRow(supabase, {
              event_id: eventId,
              blueprint_id: blueprintId,
              generation_cycle_id: generationCycleId,
              query: queryItem.query,
              api: 'llm_stub',
              content: chunkText,
              quality_score: qualityScore,
              metadata,
            });

            if (!insertResult.success) {
              console.error(
                `[research] ${queryProgress} Database error storing stub result: ${insertResult.message}`
              );
              continue;
            }

            insertedCount.value++;
            chunks.push({
              text: chunkText,
              source: 'research_stub',
              metadata,
            });
          }
          } catch (err: unknown) {
            console.error('[orchestrator] error:', String(err));
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
              console.log(`[research] ${queryProgress} Creating Exa research task (will poll in background)...`);
              
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

              // Create research task (returns immediately, doesn't wait for completion)
              // Per Exa docs: https://docs.exa.ai/reference/research/create-a-task
              const research = await exa.research.create({
                model: 'exa-research', // Use standard model (exa-research-pro is 2x more expensive)
                instructions: instructions,
                outputSchema: outputSchema, // Constrains agent scope, reduces searches/pages
              });

              console.log(`[research] ${queryProgress} ✓ Exa research task created: ${research.researchId}, status: ${research.status}. Will poll in background.`);
              console.log(`[research] ${queryProgress} Note: Research uses variable pricing ($5/1k searches, $5/1k pages, $5/1M reasoning tokens). OutputSchema helps constrain scope.`);

              // Store task for background polling (don't block here)
              pendingResearchTasks.push({
                researchId: research.researchId,
                queryItem,
                queryNumber,
                queryProgress,
                createdAt: Date.now(),
                startTime,
              });
              
              // Update progress immediately (task started, not completed)
              await updateGenerationCycle(supabase, generationCycleId, {
                progress_current: queryNumber,
              });
              
              console.log(`[research] ${queryProgress} Moving on to next query while research task runs in background...`);
              continue; // Continue to next query immediately
            } catch (err: unknown) {
              console.error('[orchestrator] error:', String(err));
            }
          } else {
            // Use /search endpoint for priority 3+ queries (current implementation)
            console.log(`[research] ${queryProgress} Using Exa /search endpoint for query (priority ${queryItem.priority}): "${queryItem.query}"`);
            const startTime = Date.now();
            
            try {
              await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount, costBreakdown);
              const duration = Date.now() - startTime;
              console.log(`[research] ${queryProgress} ✓ Exa /search completed in ${duration}ms for query: "${queryItem.query}"`);
            } catch (err: unknown) {
              console.error('[orchestrator] error:', String(err));
            }
          }
        }
      }

      // Update progress after successful query processing
      await updateGenerationCycle(supabase, generationCycleId, {
        progress_current: queryNumber,
      });
      
      console.log(`[research] ${queryProgress} Query processing complete. Total chunks so far: ${insertedCount.value}`);
    } catch (err: unknown) {
      console.error('[orchestrator] error:', String(err));
    }
  }

  // Poll for pending research tasks if any were started
  if (pendingResearchTasks.length > 0 && exa) {
    console.log(`[research] ========================================`);
    console.log(`[research] Starting background polling for ${pendingResearchTasks.length} research task(s)...`);
    console.log(`[research] ========================================`);
    
    await pollResearchTasks(
      exa,
      pendingResearchTasks,
      supabase,
      eventId,
      blueprintId,
      generationCycleId,
      chunks,
      insertedCount,
      costBreakdown
    );
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
 * Execute Wikipedia search and store results
 * Uses Wikipedia MediaWiki API (free, no API key required)
 */
async function executeWikipediaSearch(
  query: string,
  supabase: WorkerSupabaseClient,
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
          const qualityScore = calculateWikipediaQualityScore(summaryData, chunkText);
          const sourceUrl =
            summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${pageTitle}`;
          const metadata: ResearchResultInsert['metadata'] = {
            api: 'wikipedia',
            query: query,
            title: result.title,
            url: sourceUrl,
            page_id: result.pageid,
            quality_score: qualityScore,
          };
          
          const insertResult = await insertResearchResultRow(supabase, {
            event_id: eventId,
            blueprint_id: blueprintId,
            generation_cycle_id: generationCycleId,
            query: query,
            api: 'wikipedia',
            content: chunkText,
            source_url: sourceUrl,
            quality_score: qualityScore,
            metadata,
          });
          
          if (!insertResult.success) {
            console.error(
              `[research] Wikipedia: Database error storing result for article "${result.title}": ${insertResult.message}`
            );
            continue;
          }

          chunks.push({
            text: chunkText,
            source: 'wikipedia',
            metadata,
          });
        }
        
        console.log(`[research] Wikipedia: Processed article "${result.title}" - ${textChunks.length} chunks created in ${articleDuration}ms`);
      } catch (err: unknown) {
        console.error('[orchestrator] error:', String(err));
      }
    }
    
    const totalDuration = Date.now() - startTime;
    console.log(`[research] Wikipedia: Completed query "${query}" - ${processedArticles}/${searchResults.length} articles processed (${skippedArticles} skipped), ${chunks.length} chunks created in ${totalDuration}ms`);
  } catch (err: unknown) {
    console.error('[orchestrator] error:', String(err));
  }

  return chunks;
}

/**
 * Calculate quality score for Wikipedia content
 */
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
  const {
    record: blueprintRecord,
    blueprint,
  } = await fetchBlueprintRow(supabase, blueprintId);

  if (blueprintRecord.status !== 'approved') {
    throw new Error(`Blueprint must be approved to regenerate research. Current status: ${blueprintRecord.status}`);
  }

  // Create generation cycle first (we'll use it to filter what to delete)
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

  await markGenerationCyclesSuperseded(supabase, {
    eventId,
    cycleTypes: ['research'],
    excludeCycleId: researchCycleId,
    logContext: 'old research',
  });

  // Mark downstream components (glossary, chunks) cycles as superseded
  // Don't delete data - only mark cycles to prevent UI visualization and downstream access
  await markGenerationCyclesSuperseded(supabase, {
    eventId,
    cycleTypes: ['glossary', 'chunks'],
    logContext: 'downstream glossary/chunks',
  });

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
    console.log(`[context-gen] Glossary auto-regenerated: ${glossaryCount.termCount} terms`);

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

  // Fetch blueprint
  const {
    record: blueprintRecord,
    blueprint,
  } = await fetchBlueprintRow(supabase, blueprintId);

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

  // Mark old glossary generation cycles as superseded (don't delete data, just mark cycles)
  // Note: Glossary and chunks are independent - regenerating glossary does not invalidate chunks
  await markGenerationCyclesSuperseded(supabase, {
    eventId,
    cycleTypes: ['glossary'],
    excludeCycleId: glossaryCycleId,
    logContext: 'old glossary',
  });

  // Update agent to context_complete
  await updateAgentStatus(supabase, agentId, 'context_complete');

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
  _researchResults?: ResearchResults
): Promise<number> {
  const { supabase, openai, embedModel, genModel } = options;
  void _researchResults;

  console.log(`[context-gen] Regenerating chunks stage for event ${eventId}, agent ${agentId}, blueprint ${blueprintId}`);

  // Fetch blueprint
  const {
    record: blueprintRecord,
    blueprint,
  } = await fetchBlueprintRow(supabase, blueprintId);

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

  // Mark old chunks generation cycles as superseded (don't delete data, just mark cycles)
  await markGenerationCyclesSuperseded(supabase, {
    eventId,
    cycleTypes: ['chunks'],
    excludeCycleId: chunksCycleId,
    logContext: 'old chunks',
  });

  // Update to context_complete
  await updateAgentStatus(supabase, agentId, 'context_complete');
  // Blueprint status stays 'approved'

  return chunksResult.chunkCount;
}
