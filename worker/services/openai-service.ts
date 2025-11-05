import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
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

    return this.client.chat.completions.create(request);
  }
}
