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
        exaApiKey: options.exaApiKey,
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

  console.log(`[research] Executing ${queries.length} research queries`);

  const chunks: ResearchResults['chunks'] = [];
  const insertedCount = { value: 0 }; // Use object to allow mutation in helper function

  // Initialize Exa client if API key is provided
  const exa = exaApiKey ? new Exa(exaApiKey) : null;
  if (!exa && queries.some(q => q.api === 'exa')) {
    console.warn(`[research] Exa API key not provided, but Exa queries found. Falling back to stub.`);
  }

  // Update cycle to processing
  await updateGenerationCycle(supabase, generationCycleId, {
    status: 'processing',
    progress_total: queries.length,
  });

  // Process queries
  for (let i = 0; i < queries.length; i++) {
    const queryItem = queries[i];
    try {
      if (queryItem.api === 'wikipedia') {
        // Wikipedia API implementation
        console.log(`[research] Executing Wikipedia query: ${queryItem.query}`);
        
        try {
          const wikipediaChunks = await executeWikipediaSearch(
            queryItem.query,
            supabase,
            eventId,
            blueprintId,
            generationCycleId
          );
          
          for (const chunk of wikipediaChunks) {
            insertedCount.value++;
            chunks.push(chunk);
          }
          
          console.log(`[research] Processed ${wikipediaChunks.length} Wikipedia chunks for query: ${queryItem.query}`);
        } catch (wikipediaError: any) {
          console.error(`[research] Wikipedia API error for query "${queryItem.query}": ${wikipediaError.message}`);
          // Continue with other queries even if one fails
        }
        continue;
      } else if (queryItem.api === 'exa') {
        if (!exa) {
          // Fallback to stub if Exa API key not available
          console.log(`[research] Exa query (stub fallback): ${queryItem.query}`);
          const stubChunks = await generateStubResearchChunks(queryItem.query, openai, genModel);
          
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
              console.error(`[research] Error storing research result: ${error.message}`);
            } else {
              insertedCount.value++;
              chunks.push({
                text: chunkText,
                source: 'research_stub',
                metadata,
              });
            }
          }
        } else {
          // Use /research endpoint for high-priority queries (priority 1-2)
          if (queryItem.priority <= 2) {
            console.log(`[research] Using /research endpoint for high-priority query (priority ${queryItem.priority}): ${queryItem.query}`);
            
            try {
              // Create comprehensive research task
              const research = await exa.research.create({
                instructions: `Conduct comprehensive research on: ${queryItem.query}. 
                              Focus on: latest developments, industry standards, best practices, 
                              key insights, and practical applications. 
                              Provide a structured, detailed report suitable for professional context.`,
                model: 'exa-research', // Use standard model (can upgrade to 'exa-research-pro' for deeper analysis)
              });

              console.log(`[research] Research task created: ${research.researchId}, polling for completion...`);

              // Poll until research is completed
              const completedResearch = await exa.research.pollUntilFinished(research.researchId, {
                timeoutMs: 300000, // 5 minutes timeout
                pollInterval: 2000, // Poll every 2 seconds
                events: false, // Don't include events for now
              });

              if (completedResearch.status === 'completed' && completedResearch.output) {
                console.log(`[research] Research completed for query: ${queryItem.query}`);
                
                // Extract text from research output (can be string or object with content property)
                const researchText = typeof completedResearch.output === 'string' 
                  ? completedResearch.output 
                  : (completedResearch.output as any).content || (completedResearch.output as any).text || '';
                
                if (!researchText || researchText.length < 50) {
                  console.warn(`[research] Research output is empty or too short for query: ${queryItem.query}`);
                  // Fallback to /search
                  await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount);
                  continue;
                }
                
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

                console.log(`[research] Stored ${textChunks.length} chunks from comprehensive research for query: ${queryItem.query}`);
              } else if (completedResearch.status === 'failed') {
                console.error(`[research] Research task failed for query: ${queryItem.query}`);
                // Fallback to /search
                console.log(`[research] Falling back to /search for query: ${queryItem.query}`);
                await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount);
              } else {
                console.warn(`[research] Research task ended with status: ${completedResearch.status}`);
                // Fallback to /search
                await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount);
              }
            } catch (researchError: any) {
              console.error(`[research] /research endpoint error for query "${queryItem.query}": ${researchError.message}`);
              console.log(`[research] Falling back to /search for query: ${queryItem.query}`);
              // Fallback to /search
              try {
                await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount);
              } catch (searchError: any) {
                console.error(`[research] Fallback /search also failed: ${searchError.message}`);
              }
            }
          } else {
            // Use /search endpoint for priority 3+ queries (current implementation)
            console.log(`[research] Using /search endpoint for query (priority ${queryItem.priority}): ${queryItem.query}`);
            await executeExaSearch(queryItem, exa, supabase, eventId, blueprintId, generationCycleId, chunks, insertedCount);
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

  console.log(`[research] Stored ${insertedCount.value} research results in database`);
  return { chunks };
}

/**
 * Generate stub research chunks (fallback when Exa API not available)
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
  insertedCount: { value: number }
): Promise<void> {
  try {
    // Search and get contents from Exa
    // Using search() with contents option (searchAndContents is deprecated)
    const searchResults = await exa.search(queryItem.query, {
      contents: { text: true },
      numResults: 5, // Get top 5 results per query
    });

    if (!searchResults.results || searchResults.results.length === 0) {
      console.log(`[research] No results found for query: ${queryItem.query}`);
      return;
    }

    // Process each result and create chunks
    for (const result of searchResults.results) {
      if (!result.text) {
        console.warn(`[research] Result missing text content for URL: ${result.url}`);
        continue;
      }

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
          console.error(`[research] Error storing research result: ${error.message}`);
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

    console.log(`[research] Processed ${searchResults.results.length} Exa results for query: ${queryItem.query}`);
  } catch (exaError: any) {
    console.error(`[research] Exa API error for query "${queryItem.query}": ${exaError.message}`);
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
  
  try {
    // Step 1: Search Wikipedia for relevant articles
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`;
    
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      throw new Error(`Wikipedia search API returned ${searchResponse.status}`);
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
    
    if (searchResults.length === 0) {
      console.log(`[research] No Wikipedia articles found for query: ${query}`);
      return chunks;
    }
    
    console.log(`[research] Found ${searchResults.length} Wikipedia articles for query: ${query}`);
    
    // Step 2: Fetch content for top results
    for (const result of searchResults) {
      try {
        // Use Wikipedia REST API for page summaries (simpler and faster)
        const pageTitle = encodeURIComponent(result.title.replace(/ /g, '_'));
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;
        
        const summaryResponse = await fetch(summaryUrl);
        if (!summaryResponse.ok) {
          console.warn(`[research] Failed to fetch Wikipedia summary for "${result.title}": ${summaryResponse.status}`);
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
          console.warn(`[research] Wikipedia article "${result.title}" has insufficient content`);
          continue;
        }
        
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
            console.error(`[research] Error storing Wikipedia result: ${error.message}`);
          } else {
            chunks.push({
              text: chunkText,
              source: 'wikipedia',
              metadata,
            });
          }
        }
      } catch (articleError: any) {
        console.warn(`[research] Error processing Wikipedia article "${result.title}": ${articleError.message}`);
        // Continue with next article
      }
    }
    
    console.log(`[research] Processed ${chunks.length} Wikipedia chunks from ${searchResults.length} articles`);
  } catch (error: any) {
    console.error(`[research] Wikipedia API error for query "${query}": ${error.message}`);
    throw error;
  }
  
  return chunks;
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
    const chunksCount = await buildContextChunks(
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
      exaApiKey: options.exaApiKey,
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
