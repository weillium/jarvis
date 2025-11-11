import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions';
import type { OpenAIService } from '../../../services/openai-service';
import type { ChatCompletionDTO } from '../../../types';
import { safeJsonParse } from '../../session-adapters/shared/payload-utils';

export interface ExecuteJsonPromptOptions {
  openaiService: OpenAIService;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseFormat?: ChatCompletionCreateParams['response_format'];
}

export interface ExecuteJsonPromptResult {
  response: ChatCompletionDTO;
  content: string | null;
  parsed: JsonValue | null;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const executeJsonPrompt = async (
  options: ExecuteJsonPromptOptions
): Promise<ExecuteJsonPromptResult> => {
  const { openaiService, model, systemPrompt, userPrompt, temperature, responseFormat } = options;

  const response = await openaiService.createChatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    {
      responseFormat: responseFormat ?? { type: 'json_object' },
      temperature,
      model,
    }
  );

  const content = response.choices[0]?.message?.content ?? null;
  const parsed = content ? safeJsonParse<JsonValue>(content) : null;

  return {
    response,
    content,
    parsed,
  };
};


