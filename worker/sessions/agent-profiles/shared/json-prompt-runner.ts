import type { OpenAIService } from '../../../services/openai-service';
import type { ChatCompletionDTO } from '../../../types';
import { safeJsonParse } from '../../session-adapters/shared/payload-utils';

export interface ExecuteJsonPromptOptions {
  openaiService: OpenAIService;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}

export interface ExecuteJsonPromptResult {
  response: ChatCompletionDTO;
  content: string | null;
  parsed: unknown | null;
}

export const executeJsonPrompt = async (
  options: ExecuteJsonPromptOptions
): Promise<ExecuteJsonPromptResult> => {
  const { openaiService, model, systemPrompt, userPrompt, temperature } = options;

  const response = await openaiService.createChatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      responseFormat: { type: 'json_object' },
      temperature,
      model,
    }
  );

  const content = response.choices[0]?.message?.content ?? null;
  const parsed = content ? safeJsonParse<unknown>(content) : null;

  return {
    response,
    content,
    parsed,
  };
};


