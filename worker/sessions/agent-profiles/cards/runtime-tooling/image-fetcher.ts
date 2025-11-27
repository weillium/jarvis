import type { Exa } from 'exa-js';
import type { Logger } from '../../../../services/observability/logger';

export type ImageFetchProvider = 'pexels' | 'google' | 'exa';

export interface ImageFetchResult {
  url: string | null;
  provider: ImageFetchProvider;
  cost: number;
}

export class ImageFetcher {
  constructor(
    private readonly provider: ImageFetchProvider,
    private readonly pexelsApiKey?: string,
    private readonly googleApiKey?: string,
    private readonly googleSearchEngineId?: string,
    private readonly exaClient?: Exa,
    private readonly logger?: Logger
  ) {}

  async search(query: string, eventId: string): Promise<ImageFetchResult> {
    // Try providers in order: pexels -> google -> exa
    // If query is not suitable for stock photos (non-stock), skip pexels and go to google
    const providers: ImageFetchProvider[] = ['pexels', 'google', 'exa'];
    const startIndex = providers.indexOf(this.provider);
    const skipPexels = !this.isStockPhotoQuery(query);

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[(startIndex + i) % providers.length];
      
      // Skip Pexels if query is not suitable for stock photos
      if (provider === 'pexels' && skipPexels) {
        continue;
      }

      const result = await this.tryProvider(provider, query, eventId);
      if (result.url) {
        return result;
      }
    }

    return { url: null, provider: this.provider, cost: 0 };
  }

  private async tryProvider(
    provider: ImageFetchProvider,
    query: string,
    eventId: string
  ): Promise<ImageFetchResult> {
    const { calculateImageFetchCost } = await import('../../../../lib/pricing');
    const cost = calculateImageFetchCost(provider);

    try {
      let imageUrl: string | null = null;

      if (provider === 'pexels' && this.pexelsApiKey) {
        imageUrl = await this.fetchPexels(query);
      } else if (provider === 'google' && this.googleApiKey && this.googleSearchEngineId) {
        imageUrl = await this.fetchGoogle(query);
      } else if (provider === 'exa' && this.exaClient) {
        imageUrl = await this.fetchExa(query);
      }

      if (imageUrl) {
        this.logger?.log(eventId, 'cards', 'log', '[image] Fetched image', {
          provider,
          cost,
          query: query.substring(0, 100),
        });
        return { url: imageUrl, provider, cost };
      }
    } catch (error) {
      this.logger?.log(eventId, 'cards', 'warn', '[image] Fetch failed', {
        provider,
        error: String(error),
      });
    }

    return { url: null, provider, cost: 0 };
  }

  private async fetchPexels(query: string): Promise<string | null> {
    if (!this.pexelsApiKey) return null;

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
      {
        headers: {
          Authorization: this.pexelsApiKey,
        },
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as { photos?: Array<{ src?: { large?: string } }> };
    return data.photos?.[0]?.src?.large ?? null;
  }

  private async fetchGoogle(query: string): Promise<string | null> {
    if (!this.googleApiKey || !this.googleSearchEngineId) return null;

    const url = `https://www.googleapis.com/customsearch/v1?key=${this.googleApiKey}&cx=${this.googleSearchEngineId}&q=${encodeURIComponent(query)}&searchType=image&num=1`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = (await response.json()) as { items?: Array<{ link?: string }> };
    return data.items?.[0]?.link ?? null;
  }

  private async fetchExa(query: string): Promise<string | null> {
    if (!this.exaClient) return null;

    try {
      const results = await this.exaClient.search(query, {
        type: 'neural',
        numResults: 5,
      });

      if (results.results && results.results.length > 0) {
        // Look for image URLs in results
        for (const result of results.results) {
          // Check if URL is an image
          if (result.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(result.url)) {
            return result.url;
          }
        }
        // If no direct image URL found, return first result URL (might be an image page)
        const firstResult = results.results[0];
        if (firstResult.url) {
          return firstResult.url;
        }
      }
    } catch {
      // Logged in tryProvider
      return null;
    }

    return null;
  }

  private isStockPhotoQuery(query: string): boolean {
    const stockKeywords = [
      'photo',
      'photograph',
      'picture',
      'image',
      'stock',
      'professional',
      'business',
      'people',
      'person',
      'office',
      'team',
      'cityscape',
      'landscape',
      'nature',
    ];
    const lower = query.toLowerCase();
    return stockKeywords.some((keyword) => lower.includes(keyword));
  }
}

