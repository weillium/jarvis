/**
 * Enhanced Chunks Builder
 * Builds ranked context chunks from research results, documents, and LLM generation
 * Stores chunks in context_items table with rank and research_source
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { Blueprint } from './blueprint-generator';
import type { ResearchResults, ResearchChunkMetadata } from './glossary-builder';
import {
  CONTEXT_CHUNKS_GENERATION_SYSTEM_PROMPT,
  createContextChunksUserPrompt,
} from '../../prompts';
import {
  calculateOpenAICost,
  getPricingVersion,
} from './pricing-config';
import type { OpenAIUsage } from './pricing-config';
import {
  formatBlueprintDetailsForPrompt,
  formatGlossaryHighlightsForPrompt,
  formatResearchSummaryForPrompt,
} from '../../lib/text/llm-prompt-formatting';

type WorkerSupabaseClient = SupabaseClient<any, any, any>;

export interface ChunksBuilderOptions {
  supabase: WorkerSupabaseClient;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
}

export interface ChunkWithRank {
  text: string;
  source: string;
  research_source: string;
  rank: number;
  quality_score?: number;
  metadata?: ChunkMetadata;
}

type ChunkMetadata = ResearchChunkMetadata;
type ResearchChunk = ResearchResults['chunks'][number];

/**
 * Build context chunks from blueprint plan, research results, and documents
 * Ranks chunks and stores top N in context_items table
 * Fetches research from research_results table if not provided
 */
export interface ChunksCostBreakdown {
  openai: {
    total: number;
    chat_completions: Array<{ cost: number; usage: OpenAIUsage; model: string }>;
    embeddings: Array<{ cost: number; usage: OpenAIUsage; model: string }>;
  };
}

export interface ChunksBuildResult {
  chunkCount: number;
  costBreakdown: ChunksCostBreakdown;
}

type SupabaseErrorLike = { message: string } | null;
type SupabaseMutationResult = { error: SupabaseErrorLike };
type SupabaseListResult<T> = { data: T[] | null; error: SupabaseErrorLike };
type IdRow = { id: string };
type ResearchResultRecord = {
  content: string;
  metadata: ChunkMetadata | null;
  query: string | null;
  api: string | null;
};
type ChatCompletionRequest = Parameters<OpenAI['chat']['completions']['create']>[0];
const asDbPayload = <T>(payload: T) => payload as unknown as never;

export async function buildContextChunks(
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  blueprint: Blueprint,
  researchResults: ResearchResults | null,
  options: ChunksBuilderOptions
): Promise<ChunksBuildResult> {
  const { supabase, openai, embedModel, genModel } = options;

  console.log(`[chunks] Building context chunks for event ${eventId}, cycle ${generationCycleId}`);
  console.log(`[chunks] Target: ${blueprint.chunks_plan.target_count} chunks (${blueprint.chunks_plan.quality_tier} tier)`);

  // Initialize cost tracking
  const costBreakdown: ChunksCostBreakdown = {
    openai: {
      total: 0,
      chat_completions: [],
      embeddings: [],
    },
  };

  // Fetch research from research_results table if not provided
  // Exclude research from superseded generation cycles
  let research: ResearchResults;
  if (!researchResults) {
    // First, get all active (non-superseded) generation cycle IDs for research
    const {
      data: activeCycles,
      error: cycleError,
    }: SupabaseListResult<IdRow> = await supabase
      .from('generation_cycles')
      .select('id')
      .eq('event_id', eventId)
      .neq('status', 'superseded')
      .in('cycle_type', ['research']);

    if (cycleError) {
      console.warn(`[chunks] Warning: Failed to fetch active research cycles: ${cycleError.message}`);
    }

    // Build list of active cycle IDs
    const activeCycleIds: string[] = [];
    if (activeCycles && activeCycles.length > 0) {
      activeCycleIds.push(...activeCycles.map(c => c.id));
    }

    // Fetch research results only from active cycles (or legacy items)
    let researchQuery = supabase
      .from('research_results')
      .select('content, metadata, query, api')
      .eq('event_id', eventId)
      .eq('blueprint_id', blueprintId);

    if (activeCycleIds.length > 0) {
      // Include items with null generation_cycle_id OR items from active cycles
      researchQuery = researchQuery.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeCycleIds.join(',')})`);
    } else {
      // If no active cycles, only show legacy items (null generation_cycle_id)
      researchQuery = researchQuery.is('generation_cycle_id', null);
    }

    const {
      data: researchData,
      error: researchError,
    }: SupabaseListResult<ResearchResultRecord> = await researchQuery;

    if (researchError) {
      console.warn(`[chunks] Warning: Failed to fetch research results: ${researchError.message}`);
    }

    research = {
      chunks: (researchData ?? []).map(item => ({
        text: item.content,
        source: item.api || 'research',
        metadata: item.metadata || undefined,
      })),
    };
  } else {
    research = researchResults;
  }

  // Legacy deletion code removed - we now use superseding approach
  // Old chunks are marked as superseded via generation cycles, not deleted

  // Update generation cycle to processing
  const { error: processingError }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(asDbPayload({
      status: 'processing',
      progress_total: blueprint.chunks_plan.target_count || 500,
    }))
    .eq('id', generationCycleId);

  if (processingError) {
    console.warn(`[chunks] Failed to mark generation cycle as processing: ${processingError.message}`);
  }

  // 1. Collect chunks from all sources
  const allChunks: ChunkWithRank[] = [];

  // Add research result chunks
  for (const chunk of research.chunks) {
    // Validate chunk text before adding
    if (!chunk.text || typeof chunk.text !== 'string' || chunk.text.trim().length === 0) {
      console.warn(`[chunks] Skipping research chunk with invalid text: ${typeof chunk.text}`);
      continue;
    }
    
    allChunks.push({
      text: chunk.text.trim(), // Normalize by trimming
      source: chunk.source || 'research',
      research_source: chunk.metadata?.api || 'exa',
      rank: 0, // Will be calculated
      quality_score: chunk.metadata?.quality_score || 0.8,
      metadata: chunk.metadata,
    });
  }

  // 2. Generate additional LLM chunks if needed (based on chunks plan)
  const llmChunks = await generateLLMChunks(
    blueprint,
    research,
    openai,
    genModel,
    costBreakdown
  );

  // 2. Add LLM-generated chunks (already validated in generateLLMChunks)
  for (const chunk of llmChunks) {
    // Double-check validation (should already be validated, but be safe)
    if (!chunk || typeof chunk !== 'string' || chunk.trim().length === 0) {
      console.warn(`[chunks] Skipping LLM chunk with invalid text`);
      continue;
    }
    
    allChunks.push({
      text: chunk.trim(), // Ensure trimmed
      source: 'llm_generation',
      research_source: 'llm_generation',
      rank: 0,
      quality_score: 0.7, // Slightly lower than research
    });
  }

  console.log(`[chunks] Collected ${allChunks.length} total chunks from all sources`);

  // 3. Rank chunks by relevance and quality
  const rankedChunks = rankChunks(allChunks);

  // 4. Select top N chunks based on target count
  const targetCount = blueprint.chunks_plan.target_count || 500;
  const selectedChunks = rankedChunks.slice(0, targetCount);

  console.log(`[chunks] Selected top ${selectedChunks.length} chunks after ranking`);

  // 5. Generate embeddings and store in database
  let insertedCount = 0;
  const embeddingBatchSize = 10; // Process embeddings in batches

  for (let i = 0; i < selectedChunks.length; i += embeddingBatchSize) {
    const batch = selectedChunks.slice(i, i + embeddingBatchSize);

    // Filter out chunks with invalid text
    const validBatch = batch.filter(chunk => {
      if (!chunk.text || typeof chunk.text !== 'string' || chunk.text.trim().length === 0) {
        console.warn(`[chunks] Skipping chunk with invalid text (rank ${chunk.rank}): text is ${typeof chunk.text === 'string' ? 'empty' : 'not a string'}`);
        return false;
      }
      return true;
    });

    if (validBatch.length === 0) {
      console.warn(`[chunks] Batch ${i / embeddingBatchSize + 1} has no valid chunks, skipping`);
      continue;
    }

    try {
      // Generate embeddings in parallel
      // Filter again and validate text is a non-empty string
      const embeddingBatch = validBatch
        .map(chunk => {
          const text = typeof chunk.text === 'string' ? chunk.text.trim() : String(chunk.text || '').trim();
          return { ...chunk, text };
        })
        .filter(chunk => {
          if (!chunk.text || chunk.text.length === 0) {
            console.warn(`[chunks] Skipping chunk with empty text after trimming (rank ${chunk.rank})`);
            return false;
          }
          // OpenAI embeddings API has a maximum input length (8191 tokens for text-embedding-3-small)
          // Rough estimate: 1 token ≈ 4 characters, so max ~32k characters
          if (chunk.text.length > 32000) {
            console.warn(`[chunks] Skipping chunk with text too long (${chunk.text.length} chars, rank ${chunk.rank}), truncating`);
            chunk.text = chunk.text.substring(0, 32000);
          }
          return true;
        });

      if (embeddingBatch.length === 0) {
        console.warn(`[chunks] Batch ${i / embeddingBatchSize + 1} has no valid chunks after final validation, skipping`);
        continue;
      }

      const embeddingPromises = embeddingBatch.map(chunk => {
        // Double-check that input is a valid non-empty string
        if (typeof chunk.text !== 'string' || chunk.text.length === 0) {
          throw new Error(`Invalid chunk text: ${typeof chunk.text} (length: ${chunk.text?.length || 0})`);
        }
        return openai.embeddings.create({
          model: embedModel,
          input: chunk.text,
        });
      });

      const embeddingResponses = await Promise.all(embeddingPromises);

      // Track embedding costs
      for (const embeddingResponse of embeddingResponses) {
        if (embeddingResponse.usage) {
          const usage = embeddingResponse.usage as Partial<OpenAIUsage>;
          const promptTokens = usage.prompt_tokens ?? 0;
          const completionTokens = usage.completion_tokens ?? 0;
          const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
          const usageForCost: OpenAIUsage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          };
          const cost = calculateOpenAICost(usageForCost, embedModel, true); // isEmbedding = true
          costBreakdown.openai.total += cost;
          costBreakdown.openai.embeddings.push({
            cost,
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
            },
            model: embedModel,
          });
        }
      }

      // Store chunks with embeddings
      for (let j = 0; j < embeddingBatch.length; j++) {
        const chunk = embeddingBatch[j];
        const embeddingResponse = embeddingResponses[j];
        
        if (!embeddingResponse || !embeddingResponse.data || !embeddingResponse.data[0]) {
          console.error(`[chunks] Invalid embedding response for chunk at rank ${chunk.rank}`);
          continue;
        }
        
        const embedding = embeddingResponse.data[0].embedding;

        try {
          // Determine component type
          const componentType = chunk.research_source === 'llm_generation' 
            ? 'llm_generated' 
            : chunk.rank ? 'ranked' : 'research';

          // Build metadata JSONB with all metadata fields
          const itemMetadata = {
            ...(chunk.metadata || {}),
            source: chunk.source,
            enrichment_source: chunk.research_source,
            research_source: chunk.research_source,
            component_type: componentType,
            quality_score: chunk.quality_score || 0.8,
            chunk_size: chunk.text.length,
            enrichment_timestamp: new Date().toISOString(),
          };

          const { error: insertError }: SupabaseMutationResult = await supabase
            .from('context_items')
            .insert(asDbPayload({
              event_id: eventId,
              generation_cycle_id: generationCycleId,
              chunk: chunk.text,
              embedding: embedding,
              rank: chunk.rank,
              metadata: itemMetadata,
            }));

          if (insertError) {
            console.error(`[chunks] Error inserting chunk at rank ${chunk.rank}: ${insertError.message}`);
          } else {
            insertedCount++;
            // Update progress
            const { error: progressError }: SupabaseMutationResult = await supabase
              .from('generation_cycles')
              .update(asDbPayload({ progress_current: insertedCount }))
              .eq('id', generationCycleId);

            if (progressError) {
              console.warn(`[chunks] Failed to update progress for cycle ${generationCycleId}: ${progressError.message}`);
            }
          }
        // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[chunks] Error processing chunk: ${message}`);
        }
      }
    // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[chunks] Error processing batch: ${message}`);
      if (typeof error === 'object' && error && 'response' in error) {
        const response = (error as { response?: { data?: unknown } }).response;
        if (response?.data) {
          console.error(`[chunks] OpenAI API error details:`, JSON.stringify(response.data, null, 2));
        }
      }
      // Log the first invalid chunk in the batch for debugging
      if (validBatch.length > 0) {
        const firstChunk = validBatch[0];
        console.error(`[chunks] First chunk in failed batch - type: ${typeof firstChunk.text}, length: ${firstChunk.text?.length || 'N/A'}, text preview: ${String(firstChunk.text || '').substring(0, 100)}`);
      }
    }
  }

  // Calculate total cost and store in cycle metadata
  const totalCost = costBreakdown.openai.total;
  const costMetadata = {
    cost: {
      total: totalCost,
      currency: 'USD',
      breakdown: {
        openai: {
          total: costBreakdown.openai.total,
          chat_completions: costBreakdown.openai.chat_completions,
          embeddings: costBreakdown.openai.embeddings,
        },
      },
      tracked_at: new Date().toISOString(),
      pricing_version: getPricingVersion(),
    },
  };

  // Mark cycle as completed with cost metadata
  const { error: cycleUpdateError }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(asDbPayload({
      status: 'completed',
      progress_current: insertedCount,
      completed_at: new Date().toISOString(),
      metadata: costMetadata,
    }))
    .eq('id', generationCycleId);

  if (cycleUpdateError) {
    console.error(`[chunks] ERROR: Failed to update generation cycle to completed: ${cycleUpdateError.message}`);
    throw new Error(`Failed to update generation cycle: ${cycleUpdateError.message}`);
  }

  console.log(`[chunks] Inserted ${insertedCount} context chunks for event ${eventId} (cost: $${totalCost.toFixed(4)})`);
  console.log(`[chunks] Generation cycle ${generationCycleId} marked as completed`);
  return {
    chunkCount: insertedCount,
    costBreakdown,
  };
}

/**
 * Generate additional LLM chunks based on blueprint plan
 */
async function generateLLMChunks(
  blueprint: Blueprint,
  researchResults: ResearchResults,
  openai: OpenAI,
  genModel: string,
  costBreakdown: ChunksCostBreakdown
): Promise<string[]> {
  // Calculate how many LLM chunks we need
  const targetCount = blueprint.chunks_plan.target_count || 500;
  const researchChunkCount = researchResults.chunks.length;
  const neededLLMChunks = Math.max(0, targetCount - researchChunkCount);

  if (neededLLMChunks === 0) {
    console.log(`[chunks] Research results sufficient, skipping LLM chunk generation`);
    return [];
  }

  console.log(`[chunks] Generating ${neededLLMChunks} additional LLM chunks`);

  const systemPrompt = CONTEXT_CHUNKS_GENERATION_SYSTEM_PROMPT;

  const researchSummary = formatResearchSummaryForPrompt(researchResults.chunks);

  const blueprintDetails = formatBlueprintDetailsForPrompt({
    neededLLMChunks,
    qualityTier: blueprint.chunks_plan.quality_tier,
    inferredTopics: blueprint.inferred_topics,
  });

  const glossaryHighlights = formatGlossaryHighlightsForPrompt(blueprint.key_terms);

  const userPrompt = createContextChunksUserPrompt(
    researchSummary,
    blueprintDetails,
    glossaryHighlights
  );

  try {
    // Some models (like o1, o1-preview, o1-mini, gpt-5) don't support custom temperature values
    // Only set temperature if model supports custom values
    const isO1Model = genModel.startsWith('o1');
    const onlySupportsDefaultTemp = isO1Model || genModel.includes('gpt-5');
    const supportsCustomTemperature = !onlySupportsDefaultTemp;
    
    // Build request options - conditionally include temperature
    const requestOptions: ChatCompletionRequest = {
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };
    
    // Only add temperature if model supports custom temperature values
    if (supportsCustomTemperature) {
      requestOptions.temperature = 0.7;
    }
    
    const response = await openai.chat.completions.create(
      requestOptions
    ) as OpenAI.Chat.Completions.ChatCompletion;

    // Track OpenAI cost for chat completion
  if (response.usage) {
    const usage = response.usage as Partial<OpenAIUsage>;
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    const usageForCost: OpenAIUsage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    };
    const cost = calculateOpenAICost(usageForCost, genModel, false);
    costBreakdown.openai.total += cost;
    costBreakdown.openai.chat_completions.push({
      cost,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      },
      model: genModel,
      });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    // TODO: narrow unknown -> SyntaxError after upstream callsite analysis
    } catch {
      console.error(`[chunks] Failed to parse LLM response as JSON: ${content.substring(0, 200)}`);
      throw new Error('LLM response is not valid JSON');
    }

    // Handle both formats: { chunks: [...] } and [...] (array directly)
    let chunks: unknown[] = [];
    if (Array.isArray(parsed)) {
      chunks = parsed;
    } else if (parsed && Array.isArray((parsed as { chunks?: unknown[] }).chunks)) {
      chunks = (parsed as { chunks: unknown[] }).chunks ?? [];
    } else {
      console.error(`[chunks] Unexpected LLM response format. Parsed:`, JSON.stringify(parsed).substring(0, 200));
      throw new Error('LLM did not return array of chunks in expected format');
    }

    // Filter and validate chunks - ensure they are non-empty strings
    const validChunks = chunks
      .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0)
      .map(chunk => chunk.trim()) // Normalize by trimming
      .slice(0, neededLLMChunks);

    console.log(`[chunks] Generated ${validChunks.length} valid LLM chunks (filtered ${chunks.length - validChunks.length} invalid)`);

    return validChunks;
  // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[chunks] Error generating LLM chunks: ${message}`);
    return [];
  }
}

/**
 * Rank chunks by relevance and quality
 */
function rankChunks(chunks: ChunkWithRank[]): ChunkWithRank[] {
  // Simple ranking strategy: combine quality score with source priority
  // Research results get higher priority, then LLM generation
  const sourcePriority: Record<string, number> = {
    exa: 1.0,
    wikipedia: 0.9,
    llm_generation: 0.7,
    research: 0.8,
  };

  const scoredChunks = chunks.map((chunk) => {
    const sourceScore = sourcePriority[chunk.research_source] ?? 0.5;
    const qualityScore = chunk.quality_score ?? 0.7;
    return {
      chunk,
      score: sourceScore * 0.6 + qualityScore * 0.4,
    };
  });

  scoredChunks.sort((a, b) => b.score - a.score);

  return scoredChunks.map(({ chunk }, index) => ({
    ...chunk,
    rank: index + 1,
  }));
}
