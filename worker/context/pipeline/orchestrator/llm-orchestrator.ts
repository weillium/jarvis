import type OpenAI from 'openai';
import {
  STUB_RESEARCH_SYSTEM_PROMPT,
  createStubResearchUserPrompt,
} from '../../../prompts';
import { calculateOpenAICost, type OpenAIUsage } from '../pricing-config';
import { isRecord } from '../../../lib/context-normalization';

export async function generateStubResearchChunks(
  query: string,
  openai: OpenAI,
  genModel: string,
  costBreakdown?: {
    openai: { total: number; chat_completions: Array<{ cost: number; usage: OpenAIUsage; model: string }> };
  }
): Promise<string[]> {
  try {
    const requestOptions: Parameters<OpenAI['chat']['completions']['create']>[0] = {
      model: genModel,
      messages: [
        { role: 'system', content: STUB_RESEARCH_SYSTEM_PROMPT },
        { role: 'user', content: createStubResearchUserPrompt(query) },
      ],
      response_format: { type: 'json_object' },
      stream: false,
    };

    const rawResponse = await openai.chat.completions.create(requestOptions);
    if (!isRecord(rawResponse) || !Array.isArray(rawResponse.choices)) {
      throw new Error('Stub research received streaming response, which is not supported');
    }
    const response = rawResponse as OpenAI.Chat.Completions.ChatCompletion;

    if (costBreakdown && response.usage) {
      const usage = response.usage;
      const usageForCost: OpenAIUsage = {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens ?? 0,
        total_tokens:
          usage.total_tokens ?? usage.prompt_tokens + (usage.completion_tokens ?? 0),
      };
      const cost = calculateOpenAICost(usageForCost, genModel, false);
      costBreakdown.openai.total += cost;
      costBreakdown.openai.chat_completions.push({
        cost,
        usage: usageForCost,
        model: genModel,
      });
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn('[research] Stub research response is not valid JSON');
      return [];
    }

    if (!isRecord(parsed)) {
      console.warn('[research] Stub research response missing object payload');
      return [];
    }

    const chunkCandidates = parsed.chunks;
    if (!Array.isArray(chunkCandidates)) {
      return [];
    }

    return chunkCandidates.filter(
      (chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[research] Error generating stub chunks: ${message}`);
    return [];
  }
}
