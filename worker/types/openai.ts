export type ChatCompletionRole =
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool'
  | 'developer'
  | 'function';

export interface ChatCompletionMessageDTO {
  role: ChatCompletionRole;
  content: string | null;
  refusal?: string | null;
}

export interface ChatCompletionChoiceDTO {
  index: number;
  finishReason: string | null;
  message: ChatCompletionMessageDTO;
}

export interface ChatCompletionUsageDTO {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionDTO {
  id: string;
  model: string;
  created: number;
  choices: ChatCompletionChoiceDTO[];
  usage?: ChatCompletionUsageDTO;
}
