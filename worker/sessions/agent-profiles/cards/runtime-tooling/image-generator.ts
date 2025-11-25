import type OpenAI from 'openai';
import type { Logger } from '../../../../services/observability/logger';

export interface ImageGenerationOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'low' | 'medium' | 'high' | 'auto';
}

export interface ImageGenerationResult {
  url: string | null;
  model: string;
  cost: number;
}

export class ImageGenerator {
  constructor(
    private readonly openaiClient: OpenAI,
    private readonly model: string,
    private readonly logger: Logger
  ) {}

  async generate(
    prompt: string,
    eventId: string,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    try {
      // For now, only support OpenAI models (DALL-E, gpt-image-1)
      // Future: add factory/strategy pattern for other providers
      const response = await this.openaiClient.images.generate({
        model: this.model,
        prompt,
        size: options?.size ?? '1024x1024',
        quality: options?.quality ?? 'auto',
        n: 1,
      });

      const imageUrl = response.data[0]?.url ?? null;
      
      if (!imageUrl) {
        this.logger.log(eventId, 'cards', 'warn', '[image] Generation returned no URL', {
          model: this.model,
        });
        return { url: null, model: this.model, cost: 0 };
      }

      // Calculate cost based on model
      const { calculateImageGenerationCost } = await import('../../../../lib/pricing');
      const cost = calculateImageGenerationCost(this.model);

      this.logger.log(eventId, 'cards', 'log', '[image] Generated image', {
        model: this.model,
        cost,
      });

      return { url: imageUrl, model: this.model, cost };
    } catch (error) {
      this.logger.log(eventId, 'cards', 'warn', '[image] Generation failed', {
        model: this.model,
        error: String(error),
      });
      return { url: null, model: this.model, cost: 0 };
    }
  }
}

