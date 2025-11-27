import { Buffer } from 'node:buffer';
import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { Exa } from 'exa-js';
import type { Logger } from '../../../../services/observability/logger';
import { ImageGenerator } from './image-generator';
import { ImageFetcher, type ImageFetchProvider } from './image-fetcher';

const HTTP_URL_REGEX = /^https?:\/\//i;

export type CardVisualStrategy = 'fetch' | 'generate';

export interface CardVisualRequest {
  strategy: CardVisualStrategy;
  instructions: string;
  source_url?: string | null;
}

const inferExtension = (contentType: string | null, fallback: string = 'jpg'): string => {
  if (!contentType) {
    return fallback;
  }

  const segments = contentType.split('/');
  if (segments.length === 2) {
    const ext = segments[1].split('+')[0];
    if (ext && ext.trim().length > 0) {
      return ext.trim();
    }
  }

  return fallback;
};

const isAlreadyCached = (imageUrl: string, bucket: string): boolean =>
  imageUrl.includes(`/storage/v1/object/public/${bucket}/`);

export class CardImageService {
  private readonly imageGenerator?: ImageGenerator;
  private readonly imageFetcher?: ImageFetcher;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
    private readonly logger: Logger,
    openaiClient?: OpenAI,
    imageGenModel?: string,
    imageFetchProvider?: ImageFetchProvider,
    pexelsApiKey?: string,
    googleApiKey?: string,
    googleSearchEngineId?: string,
    exaClient?: Exa
  ) {
    if (openaiClient && imageGenModel) {
      this.imageGenerator = new ImageGenerator(openaiClient, imageGenModel, logger);
    }

    if (imageFetchProvider) {
      this.imageFetcher = new ImageFetcher(
        imageFetchProvider,
        pexelsApiKey,
        googleApiKey,
        googleSearchEngineId,
        exaClient,
        logger
      );
    }
  }

  private determineStrategy(instructions: string): 'fetch' | 'generate' {
    const conceptualKeywords = ['diagram', 'chart', 'graph', 'flowchart', 'schematic', 'conceptual', 'abstract'];
    const isConceptual = conceptualKeywords.some((kw) => instructions.toLowerCase().includes(kw));
    return isConceptual ? 'generate' : 'fetch';
  }

  private extractSearchQuery(instructions: string): string {
    return instructions
      .replace(/^(show|display|find|get|an image of|a picture of)\s+/i, '')
      .replace(/\s+(image|picture|photo|photograph)$/i, '')
      .trim() || instructions;
  }

  async cacheRemoteImage(imageUrl: string, eventId: string, cardId: string): Promise<string | null> {
    if (!HTTP_URL_REGEX.test(imageUrl)) {
      return null;
    }

    if (isAlreadyCached(imageUrl, this.bucket)) {
      return imageUrl;
    }

    try {
      const response = await fetch(imageUrl, { redirect: 'follow' });
      if (!response.ok) {
        this.logger.log(eventId, 'cards', 'warn', '[image] failed to download card image', {
          status: response.status,
          imageUrl,
        });
        return null;
      }

      const contentType = response.headers.get('content-type');
      const extension = inferExtension(contentType);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const path = `events/${eventId}/cards/${cardId}.${extension}`;
      const uploadResult = await this.supabase.storage.from(this.bucket).upload(path, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: contentType ?? undefined,
      });

      if (uploadResult.error) {
        this.logger.log(eventId, 'cards', 'warn', '[image] failed to upload card image', {
          error: String(uploadResult.error.message ?? uploadResult.error),
        });
        return null;
      }

      const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);
      if (!data || !data.publicUrl) {
        this.logger.log(eventId, 'cards', 'warn', '[image] failed to resolve public url for card image', {
          path,
        });
        return null;
      }

      return data.publicUrl;
    } catch (error) {
      this.logger.log(eventId, 'cards', 'warn', '[image] unexpected error caching remote image', {
        error: String(error),
        imageUrl,
      });
      return null;
    }
  }

  async handleVisualRequest(
    request: CardVisualRequest,
    eventId: string,
    cardId: string
  ): Promise<string | null> {
    if (!request || typeof request !== 'object') {
      return null;
    }

    const startTime = Date.now();
    const strategy: 'fetch' | 'generate' = request.strategy || this.determineStrategy(request.instructions);

    // If explicit source_url provided, cache it directly
    if (request.strategy === 'fetch' && typeof request.source_url === 'string' && request.source_url.trim().length > 0) {
      const cachedUrl = await this.cacheRemoteImage(request.source_url.trim(), eventId, cardId);
      if (cachedUrl) {
        const { calculateImageFetchCost } = await import('../../../../lib/pricing');
        const cost = calculateImageFetchCost('exa'); // Approximate cost
        this.logger.log(eventId, 'cards', 'log', '[image] Cached provided URL', {
          strategy: 'fetch',
          cost,
          latency: Date.now() - startTime,
        });
      }
      return cachedUrl;
    }

    // Handle fetch strategy
    if (strategy === 'fetch') {
      if (!this.imageFetcher) {
        this.logger.log(eventId, 'cards', 'warn', '[image] Fetch requested but ImageFetcher not available');
        return null;
      }

      const searchQuery = this.extractSearchQuery(request.instructions);
      const fetchResult = await this.imageFetcher.search(searchQuery, eventId);
      
      if (!fetchResult.url) {
        this.logger.log(eventId, 'cards', 'warn', '[image] All fetch providers failed', {
          query: searchQuery,
        });
        return null;
      }

      const cachedUrl = await this.cacheRemoteImage(fetchResult.url, eventId, cardId);
      if (cachedUrl) {
        this.logger.log(eventId, 'cards', 'log', '[image] Fetched and cached image', {
          provider: fetchResult.provider,
          cost: fetchResult.cost,
          latency: Date.now() - startTime,
        });
      }
      return cachedUrl;
    }

    // Handle generate strategy
    if (strategy === 'generate') {
      if (!this.imageGenerator) {
        this.logger.log(eventId, 'cards', 'warn', '[image] Generate requested but ImageGenerator not available');
        return null;
      }

      const genResult = await this.imageGenerator.generate(request.instructions, eventId);
      
      if (!genResult.url) {
        this.logger.log(eventId, 'cards', 'warn', '[image] Generation failed', {
          model: genResult.model,
        });
        return null;
      }

      const cachedUrl = await this.cacheRemoteImage(genResult.url, eventId, cardId);
      if (cachedUrl) {
        this.logger.log(eventId, 'cards', 'log', '[image] Generated and cached image', {
          model: genResult.model,
          cost: genResult.cost,
          latency: Date.now() - startTime,
        });
      }
      return cachedUrl;
    }

    return null;
  }
}


