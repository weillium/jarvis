/**
 * Enhanced Chunks Builder
 * Builds ranked context chunks from research results, documents, and LLM generation
 * Stores chunks in context_items table with rank and research_source
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Blueprint } from './blueprint-generator';
import { ResearchResults } from './glossary-builder';

export interface ChunksBuilderOptions {
  supabase: ReturnType<typeof createClient>;
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
  metadata?: Record<string, any>;
}

/**
 * Build context chunks from blueprint plan, research results, and documents
 * Ranks chunks and stores top N in context_items table
 * Fetches research from research_results table if not provided
 */
export async function buildContextChunks(
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  blueprint: Blueprint,
  researchResults: ResearchResults | null,
  options: ChunksBuilderOptions
): Promise<number> {
  const { supabase, openai, embedModel, genModel } = options;

  console.log(`[chunks] Building context chunks for event ${eventId}, cycle ${generationCycleId}`);
  console.log(`[chunks] Target: ${blueprint.chunks_plan.target_count} chunks (${blueprint.chunks_plan.quality_tier} tier)`);

  // Fetch research from research_results table if not provided
  let research: ResearchResults;
  if (!researchResults) {
    const { data: researchData, error: researchError } = await (supabase
      .from('research_results') as any)
      .select('content, metadata, query, api')
      .eq('event_id', eventId)
      .eq('blueprint_id', blueprintId)
      .eq('is_active', true);

    if (researchError) {
      console.warn(`[chunks] Warning: Failed to fetch research results: ${researchError.message}`);
    }

    research = {
      chunks: (researchData || []).map((item: any) => ({
        text: item.content,
        source: item.api || 'research',
        metadata: item.metadata || {},
      })),
    };
  } else {
    research = researchResults;
  }

  // Soft delete existing non-research chunks (preserve research chunks)
  // Delete chunks that are not research type
  const { error: softDeleteError } = await (supabase
    .from('context_items') as any)
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)
    .eq('is_active', true)
    .neq('component_type', 'research');

  if (softDeleteError) {
    console.warn(`[chunks] Warning: Failed to soft delete existing chunks: ${softDeleteError.message}`);
  }

  // Update generation cycle to processing
  await (supabase
    .from('generation_cycles') as any)
    .update({
      status: 'processing',
      progress_total: blueprint.chunks_plan.target_count || 500,
    })
    .eq('id', generationCycleId);

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
    genModel
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
  const rankedChunks = await rankChunks(
    allChunks,
    blueprint,
    openai,
    genModel
  );

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

          const { error } = await (supabase
            .from('context_items') as any)
            .insert({
              event_id: eventId,
              generation_cycle_id: generationCycleId,
              source: chunk.source,
              chunk: chunk.text,
              embedding: embedding,
              enrichment_source: chunk.research_source,
              chunk_size: chunk.text.length,
              enrichment_timestamp: new Date().toISOString(),
              rank: chunk.rank,
              research_source: chunk.research_source,
              quality_score: chunk.quality_score || 0.8,
              metadata: chunk.metadata || {},
              component_type: componentType,
              is_active: true,
              version: 1,
            });

          if (error) {
            console.error(`[chunks] Error inserting chunk at rank ${chunk.rank}: ${error.message}`);
          } else {
            insertedCount++;
            // Update progress
            await (supabase
              .from('generation_cycles') as any)
              .update({ progress_current: insertedCount })
              .eq('id', generationCycleId);
          }
        } catch (error: any) {
          console.error(`[chunks] Error processing chunk: ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error(`[chunks] Error processing batch: ${error.message}`);
      if (error.response?.data) {
        console.error(`[chunks] OpenAI API error details:`, JSON.stringify(error.response.data, null, 2));
      }
      // Log the first invalid chunk in the batch for debugging
      if (validBatch.length > 0) {
        const firstChunk = validBatch[0];
        console.error(`[chunks] First chunk in failed batch - type: ${typeof firstChunk.text}, length: ${firstChunk.text?.length || 'N/A'}, text preview: ${String(firstChunk.text || '').substring(0, 100)}`);
      }
    }
  }

  // Mark cycle as completed
  await (supabase
    .from('generation_cycles') as any)
    .update({
      status: 'completed',
      progress_current: insertedCount,
      completed_at: new Date().toISOString(),
    })
    .eq('id', generationCycleId);

  console.log(`[chunks] Inserted ${insertedCount} context chunks for event ${eventId}`);
  return insertedCount;
}

/**
 * Generate additional LLM chunks based on blueprint plan
 */
async function generateLLMChunks(
  blueprint: Blueprint,
  researchResults: ResearchResults,
  openai: OpenAI,
  genModel: string
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

  const systemPrompt = `You are a context generation assistant that creates informative context chunks about event topics.

Your task: Generate context chunks that provide valuable background information about the event topic and key themes.

Guidelines:
- Each chunk should be 200-400 words
- Be factual and informative
- Cover different aspects of the topic
- Each chunk should be self-contained

Output format: Return a JSON object with a "chunks" field containing an array of strings, where each string is a context chunk. Example: {"chunks": ["chunk 1 text...", "chunk 2 text..."]}`;

  const researchSummary = researchResults.chunks
    .map(c => c.text)
    .join('\n\n')
    .substring(0, 3000);

  const userPrompt = `Generate ${neededLLMChunks} context chunks about the following event:

Event Topics: ${blueprint.inferred_topics.join(', ')}
Key Terms: ${blueprint.key_terms.slice(0, 10).join(', ')}

Research Summary:
${researchSummary}

Generate informative context chunks that complement the research results. Each chunk should cover a different aspect or provide additional context.

Return as a JSON object with a "chunks" field containing an array of strings. Each string should be a complete context chunk (200-400 words).`;

  try {
    const response = await openai.chat.completions.create({
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error(`[chunks] Failed to parse LLM response as JSON: ${content.substring(0, 200)}`);
      throw new Error('LLM response is not valid JSON');
    }

    // Handle both formats: { chunks: [...] } and [...] (array directly)
    let chunks: any[] = [];
    if (Array.isArray(parsed)) {
      chunks = parsed;
    } else if (parsed && Array.isArray(parsed.chunks)) {
      chunks = parsed.chunks;
    } else {
      console.error(`[chunks] Unexpected LLM response format. Parsed:`, JSON.stringify(parsed).substring(0, 200));
      throw new Error('LLM did not return array of chunks in expected format');
    }

    // Filter and validate chunks - ensure they are non-empty strings
    const validChunks = chunks
      .filter((chunk: any) => {
        return chunk && typeof chunk === 'string' && chunk.trim().length > 0;
      })
      .map((chunk: string) => chunk.trim()) // Normalize by trimming
      .slice(0, neededLLMChunks);

    console.log(`[chunks] Generated ${validChunks.length} valid LLM chunks (filtered ${chunks.length - validChunks.length} invalid)`);

    return validChunks;
  } catch (error: any) {
    console.error(`[chunks] Error generating LLM chunks: ${error.message}`);
    return [];
  }
}

/**
 * Rank chunks by relevance and quality
 */
async function rankChunks(
  chunks: ChunkWithRank[],
  blueprint: Blueprint,
  openai: OpenAI,
  genModel: string
): Promise<ChunkWithRank[]> {
  // Simple ranking strategy: combine quality score with source priority
  // Research results get higher priority, then LLM generation
  const sourcePriority: Record<string, number> = {
    'exa': 1.0,
    'wikipedia': 0.9,
    'llm_generation': 0.7,
    'research': 0.8,
  };

  // Calculate scores for each chunk
  const scoredChunks = chunks.map((chunk, index) => {
    const sourceScore = sourcePriority[chunk.research_source] || 0.5;
    const qualityScore = chunk.quality_score || 0.7;
    const combinedScore = sourceScore * 0.6 + qualityScore * 0.4;

    return {
      ...chunk,
      _score: combinedScore,
    };
  });

  // Sort by score (descending) and assign ranks
  scoredChunks.sort((a, b) => b._score - a._score);

  return scoredChunks.map((chunk, index) => ({
    ...chunk,
    rank: index + 1, // Rank 1 = highest
    _score: undefined, // Remove temporary score
  } as ChunkWithRank));
}
