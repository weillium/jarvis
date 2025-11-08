import type OpenAI from 'openai';
import type { Blueprint } from '../blueprint/types';
import type { ResearchResults } from '../glossary/types';
import {
  CONTEXT_CHUNKS_GENERATION_SYSTEM_PROMPT,
  createContextChunksUserPrompt,
} from '../../../prompts/context';
import {
  calculateOpenAICost,
} from '../pricing-config';
import type { OpenAIUsage } from '../pricing-config';
import {
  formatBlueprintDetailsForPrompt,
  formatGlossaryHighlightsForPrompt,
  formatResearchSummaryForPrompt,
} from '../../../lib/text/llm-prompt-formatting';
import type { ChunkCandidate, ChunkWithRank, ChunksCostBreakdown } from './types';

type ChatCompletionRequest = Parameters<OpenAI['chat']['completions']['create']>[0];

export const generateLLMChunks = async (
  blueprint: Blueprint,
  researchResults: ResearchResults,
  openai: OpenAI,
  genModel: string,
  costBreakdown: ChunksCostBreakdown
): Promise<string[]> => {
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
    const isO1Model = genModel.startsWith('o1');
    const onlySupportsDefaultTemp = isO1Model || genModel.includes('gpt-5');
    const supportsCustomTemperature = !onlySupportsDefaultTemp;

    const requestOptions: ChatCompletionRequest = {
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    if (supportsCustomTemperature) {
      requestOptions.temperature = 0.7;
    }

    const response = await openai.chat.completions.create(
      requestOptions
    ) as OpenAI.Chat.Completions.ChatCompletion;

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
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }

    let chunks: unknown[] = [];
    if (Array.isArray(parsed)) {
      chunks = parsed;
    } else if (parsed && Array.isArray((parsed as { chunks?: unknown[] }).chunks)) {
      chunks = (parsed as { chunks: unknown[] }).chunks ?? [];
    } else {
      console.error(`[chunks] Unexpected LLM response format. Parsed:`, JSON.stringify(parsed).substring(0, 200));
      throw new Error('LLM did not return array of chunks in expected format');
    }

    const validChunks = chunks
      .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0)
      .map(chunk => chunk.trim())
      .slice(0, neededLLMChunks);

    console.log(
      `[chunks] Generated ${validChunks.length} valid LLM chunks (filtered ${
        chunks.length - validChunks.length
      } invalid)`
    );

    return validChunks;
  } catch (err: unknown) {
    console.error("[worker] error:", String(err));
  }

  return [];
};

export const buildLLMChunkCandidates = (chunks: string[]): ChunkCandidate[] => {
  return chunks.map((chunk) => ({
    text: chunk,
    source: 'llm_generation',
    researchSource: 'llm_generation',
    qualityScore: 0.7,
  }));
};

export const rankChunks = (chunks: ChunkCandidate[]): ChunkWithRank[] => {
  const sourcePriority: Record<string, number> = {
    exa: 1.0,
    wikipedia: 0.9,
    llm_generation: 0.7,
    research: 0.8,
  };

  const scoredChunks = chunks.map((chunk) => {
    const sourceScore = sourcePriority[chunk.researchSource] ?? 0.5;
    const qualityScore = chunk.qualityScore ?? 0.7;
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
};

