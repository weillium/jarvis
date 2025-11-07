import OpenAI from 'openai';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessage,
  ChatCompletionMessageParam
} from 'openai/resources/chat/completions';
import type {
  ChatCompletionDTO,
  ChatCompletionMessageDTO
} from '../types';

export class OpenAIService {
  private client: OpenAI;
  private embedModel: string;
  private genModel: string;

  constructor(clientOrKey: OpenAI | string, embedModel: string, genModel: string) {
    if (typeof clientOrKey === 'string') {
      this.client = new OpenAI({ apiKey: clientOrKey });
    } else {
      this.client = clientOrKey;
    }
    this.embedModel = embedModel;
    this.genModel = genModel;
  }

  getClient(): OpenAI {
    return this.client;
  }

  getEmbedModel(): string {
    return this.embedModel;
  }

  getGenModel(): string {
    return this.genModel;
  }

  getRealtimeModel(defaultModel: string = 'gpt-4o-realtime-preview-2024-10-01'): string {
    return process.env.OPENAI_REALTIME_MODEL || defaultModel;
  }

  async createEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.embedModel,
      input: text,
    });

    return response.data[0].embedding;
  }

  async createChatCompletion(
    messages: ChatCompletionMessageParam[],
    options?: {
      responseFormat?: { type: 'json_object' };
      temperature?: number;
    }
  ): Promise<ChatCompletionDTO> {
    const request: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.genModel,
      messages,
    };

    if (options?.responseFormat) {
      request.response_format = options.responseFormat;
    }

    if (options?.temperature !== undefined) {
      request.temperature = options.temperature;
    }

    const response = await this.client.chat.completions.create(request);
    return mapChatCompletionResponse(response);
  }
}

const mapChatCompletionResponse = (
  response: OpenAI.Chat.Completions.ChatCompletion
): ChatCompletionDTO => ({
  id: response.id,
  created: response.created,
  model: response.model,
  choices: response.choices.map(choice => ({
    index: choice.index,
    finishReason: choice.finish_reason ?? null,
    message: mapMessage(choice.message),
  })),
  usage: response.usage
    ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens ?? 0,
        totalTokens: response.usage.total_tokens,
      }
    : undefined,
});

const mapMessage = (message: ChatCompletionMessage): ChatCompletionMessageDTO => ({
  role: message.role,
  content: normalizeMessageContent(message.content),
  refusal: message.refusal ?? null,
});

const normalizeMessageContent = (
  content: ChatCompletionMessage['content']
): string | null => {
  if (typeof content === 'string' || content === null) {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const contentParts = content as ChatCompletionContentPart[];

  const textParts = contentParts
    .map(extractTextFromPart)
    .filter((value: string): value is string => value.trim().length > 0);

  if (textParts.length === 0) {
    return null;
  }

  return textParts.join('\n');
};

const extractTextFromPart = (part: ChatCompletionContentPart): string => {
  if (part.type === 'text') {
    return part.text ?? '';
  }

  if ('text' in part && typeof part.text === 'string') {
    return part.text;
  }

  return '';
};
