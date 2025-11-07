import type OpenAI from 'openai';
import {
  STUB_RESEARCH_SYSTEM_PROMPT,
  createStubResearchUserPrompt,
} from '../../../prompts';
import { calculateOpenAICost } from '../pricing-config';

export async function generateStubResearchChunks(
  query: string,
  openai: OpenAI,
  genModel: string,
  costBreakdown?: {
    openai: { total: number; chat_completions: Array<{ cost: number; usage: any; model: string }> };
  }
): Promise<string[]> {
  try {
    const modelLower = genModel.toLowerCase();
    const isO1Model = modelLower.startsWith('o1');
    const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
    const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
    const supportsCustomTemperature = !onlySupportsDefaultTemp;

    const requestOptions: any = {
      model: genModel,
      messages: [
        { role: 'system', content: STUB_RESEARCH_SYSTEM_PROMPT },
        { role: 'user', content: createStubResearchUserPrompt(query) },
      ],
      response_format: { type: 'json_object' },
    };

    if (supportsCustomTemperature) {
      requestOptions.temperature = 0.7;
    }

    const response = await openai.chat.completions.create(requestOptions);

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
