/**
 * Enhanced Chunks Builder
 * Builds ranked context chunks from research results, documents, and LLM generation
 * Stores chunks in context_items table with rank and metadata
 */

import type OpenAI from 'openai';
import type { Blueprint } from './blueprint/types';
import type { ResearchResults } from './glossary/types';
import type { WorkerSupabaseClient } from '../../services/supabase';
import {
  calculateOpenAICost,
  getPricingVersion,
  type OpenAIUsage,
} from '../../lib/pricing';
import {
  completeCycle,
  insertContextItem,
  markCycleProcessing,
  updateCycleProgress,
} from './chunks/persistence';
import { loadResearchResults, buildResearchChunkCandidates } from './chunks/source-loader';
import { rankChunks } from './chunks/generation-runner';
import type {
  ChunkCandidate,
  ChunkWithRank,
  ChunksBuildResult,
  ChunksCostBreakdown,
} from './chunks/types';

export type { ChunksCostBreakdown, ChunksBuildResult } from './chunks/types';

export interface ChunksBuilderOptions {
  supabase: WorkerSupabaseClient;
  openai: OpenAI;
  embedModel: string;
  chunkModel: string;
}

export async function buildContextChunks(
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  blueprint: Blueprint,
  researchResults: ResearchResults | null,
  options: ChunksBuilderOptions
): Promise<ChunksBuildResult> {
  console.log(`[chunks] Building context chunks for event ${eventId}, cycle ${generationCycleId}`);
  const targetCount =
    blueprint.chunks_plan.target_count && blueprint.chunks_plan.target_count > 0
      ? blueprint.chunks_plan.target_count
      : 100;

  console.log(
    `[chunks] Target: ${targetCount} chunks (${blueprint.chunks_plan.quality_tier} tier)`
  );

  const costBreakdown: ChunksCostBreakdown = {
    openai: {
      total: 0,
      chat_completions: [],
      embeddings: [],
    },
  };

  const researchResult = await loadResearchResults({
    eventId,
    blueprintId,
    researchResults,
    supabase: options.supabase,
  });

  const research: ResearchResults = researchResult;

  await markCycleProcessing(options.supabase, generationCycleId, targetCount);

  const researchCandidates = buildResearchChunkCandidates(research);
  const dedupedCandidates = deduplicateChunkCandidates(researchCandidates);

  const candidates: ChunkCandidate[] = [...dedupedCandidates];

  console.log(`[chunks] Collected ${candidates.length} total chunks from all sources`);

  const rankedChunks: ChunkWithRank[] = rankChunks(candidates);

  const selectedChunks = rankedChunks.slice(0, targetCount);

  console.log(`[chunks] Selected top ${selectedChunks.length} chunks after ranking`);

  let insertedCount = 0;
  const embeddingBatchSize = 10;

  for (let i = 0; i < selectedChunks.length; i += embeddingBatchSize) {
    const batch = selectedChunks.slice(i, i + embeddingBatchSize);

    const validBatch = batch.filter((chunk) => {
      if (!chunk.text || typeof chunk.text !== 'string' || chunk.text.trim().length === 0) {
        console.warn(`[chunks] Skipping chunk with invalid text (rank ${chunk.rank})`);
        return false;
      }
      return true;
    });

    if (validBatch.length === 0) {
      console.warn(`[chunks] Batch ${i / embeddingBatchSize + 1} has no valid chunks, skipping`);
      continue;
    }

    try {
        const embeddingBatch = validBatch
        .map((chunk) => ({
          ...chunk,
          text: typeof chunk.text === 'string' ? chunk.text.trim() : String(chunk.text ?? '').trim(),
        }))
        .filter((chunk) => {
          if (!chunk.text || chunk.text.length === 0) {
            console.warn(`[chunks] Skipping chunk with empty text after trimming (rank ${chunk.rank})`);
            return false;
          }
          if (chunk.text.length > 32000) {
            console.warn(`[chunks] Truncating chunk with text too long (${chunk.text.length} chars, rank ${chunk.rank})`);
            chunk.text = chunk.text.substring(0, 32000);
          }
          return true;
        });

      if (embeddingBatch.length === 0) {
        console.warn(`[chunks] Batch ${i / embeddingBatchSize + 1} has no valid chunks after validation, skipping`);
        continue;
      }

      const embeddingResponses = await Promise.all(
        embeddingBatch.map((chunk) => {
          if (typeof chunk.text !== 'string' || chunk.text.length === 0) {
            throw new Error(`Invalid chunk text: ${typeof chunk.text}`);
          }
          return options.openai.embeddings.create({
            model: options.embedModel,
            input: chunk.text,
          });
        })
      );

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
          const cost = calculateOpenAICost(usageForCost, options.embedModel, true);
          costBreakdown.openai.total += cost;
          costBreakdown.openai.embeddings.push({
            cost,
            usage: usageForCost,
            model: options.embedModel,
          });
        }
      }

      for (let j = 0; j < embeddingBatch.length; j++) {
        const chunk = embeddingBatch[j];
        const embeddingResponse = embeddingResponses[j];

        if (!embeddingResponse || !embeddingResponse.data || !embeddingResponse.data[0]) {
          console.error(`[chunks] Invalid embedding response for chunk at rank ${chunk.rank}`);
          continue;
        }

        const embedding = embeddingResponse.data[0].embedding;
        const componentType =
          chunk.researchSource === 'llm_generation'
            ? 'llm_generated'
            : chunk.rank
              ? 'ranked'
              : 'research';

        const itemMetadata: Record<string, unknown> = {
          ...(chunk.metadata ?? {}),
          source: chunk.source,
          enrichment_source: chunk.researchSource,
          research_source: chunk.researchSource,
          component_type: componentType,
          quality_score: chunk.qualityScore ?? 0.8,
          chunk_size: chunk.text.length,
          enrichment_timestamp: new Date().toISOString(),
        prompt_view: chunk.promptText,
        prompt_length: chunk.promptLength ?? chunk.promptText.length,
        agent_utility: chunk.agentUtility ?? [],
        topics: chunk.topics ?? [],
        provenance_hint: chunk.provenanceHint ?? null,
        query_priority: chunk.queryPriority ?? null,
        hash: chunk.hash,
        original_length: chunk.originalLength ?? chunk.text.length,
        };

        const inserted = await insertContextItem(options.supabase, {
          event_id: eventId,
          generation_cycle_id: generationCycleId,
          chunk: chunk.text,
          embedding,
          rank: chunk.rank,
          metadata: itemMetadata,
        });

        if (inserted) {
          insertedCount++;
          await updateCycleProgress(options.supabase, generationCycleId, insertedCount);
        }
      }
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

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

  await completeCycle(options.supabase, generationCycleId, costMetadata, insertedCount);

  console.log(`[chunks] Inserted ${insertedCount} context chunks for event ${eventId} (cost: $${totalCost.toFixed(4)})`);
  console.log(`[chunks] Generation cycle ${generationCycleId} marked as completed`);

  return {
    chunkCount: insertedCount,
    costBreakdown,
  };
}

const deduplicateChunkCandidates = (candidates: ChunkCandidate[]): ChunkCandidate[] => {
  const byHash = new Map<string, ChunkCandidate>();

  for (const candidate of candidates) {
    const existing = byHash.get(candidate.hash);
    if (!existing) {
      byHash.set(candidate.hash, candidate);
      continue;
    }

    const existingScore = existing.qualityScore ?? 0;
    const candidateScore = candidate.qualityScore ?? 0;
    if (candidateScore > existingScore) {
      byHash.set(candidate.hash, candidate);
    }
  }

  return Array.from(byHash.values());
};
