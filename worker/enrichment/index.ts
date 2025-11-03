/**
 * Enrichment Orchestrator
 * Coordinates multiple enrichers to build rich vector database
 * 
 * Goal: Generate 45-75 high-quality chunks from multiple sources
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { BaseEnricher } from './enrichers/base-enricher';
import { WebSearchEnricher } from './enrichers/web-search';
import { DocumentExtractor } from './enrichers/document-extractor';
import { WikipediaEnricher } from './enrichers/wikipedia';
import { EnrichmentConfig, EnrichmentResult } from './types';

export class EnrichmentOrchestrator {
  private enrichers: Map<string, BaseEnricher> = new Map();

  constructor(
    private config: EnrichmentConfig,
    private supabase: ReturnType<typeof createClient>,
    private openai: OpenAI,
    private embedModel: string
  ) {
    this.initializeEnrichers();
  }

  private initializeEnrichers(): void {
    if (this.config.webSearch && this.config.webSearch.apiKey) {
      this.enrichers.set(
        'web_search',
        new WebSearchEnricher(
          this.config.webSearch.apiKey,
          this.config.webSearch.provider,
          this.config.webSearch.maxResults
        )
      );
    }

    if (this.config.documentExtraction?.enabled) {
      this.enrichers.set('document_extractor', new DocumentExtractor(this.supabase));
    }

    if (this.config.wikipedia?.enabled) {
      this.enrichers.set(
        'wikipedia',
        new WikipediaEnricher(this.config.wikipedia.maxArticles)
      );
    }
  }

  /**
   * Enrich context for an event
   * Returns the number of chunks inserted into the database
   */
  async enrich(
    eventId: string,
    eventTitle: string,
    eventTopic: string | null
  ): Promise<number> {
    console.log(`[enrichment] Starting enrichment for event ${eventId}`);
    console.log(`[enrichment] Enabled enrichers: ${this.config.enabled.join(', ')}`);

    const allResults: EnrichmentResult[] = [];

    // Run all enabled enrichers in parallel
    const enricherPromises = this.config.enabled.map(async (enricherName) => {
      const enricher = this.enrichers.get(enricherName);
      if (!enricher) {
        console.warn(`[enrichment] Enricher ${enricherName} not found or not configured`);
        return [];
      }

      try {
        console.log(`[enrichment] Running ${enricherName}...`);
        const results = await enricher.enrich(eventId, eventTitle, eventTopic);
        console.log(`[enrichment] ${enricherName} produced ${results.length} result(s)`);
        return results;
      } catch (error: any) {
        console.error(`[enrichment] Error in ${enricherName}: ${error.message}`);
        return [];
      }
    });

    const results = await Promise.all(enricherPromises);
    allResults.push(...results.flat());

    // Flatten chunks from all results
    const allChunks: Array<{ chunk: string; result: EnrichmentResult }> = [];
    for (const result of allResults) {
      for (const chunk of result.chunks) {
        allChunks.push({ chunk, result });
      }
    }

    console.log(`[enrichment] Total chunks to process: ${allChunks.length}`);

    // Generate embeddings and store in database
    let insertedCount = 0;
    for (const { chunk, result } of allChunks) {
      try {
        // Generate embedding
        const embeddingRes = await this.openai.embeddings.create({
          model: this.embedModel,
          input: chunk,
        });
        const embedding = embeddingRes.data[0].embedding;

        // Store in database
        const { error } = await this.supabase.from('context_items').insert({
          event_id: eventId,
          source: 'enrichment',
          chunk,
          embedding,
          enrichment_source: result.source,
          metadata: result.metadata,
          quality_score: result.qualityScore,
          chunk_size: chunk.length,
          enrichment_timestamp: new Date().toISOString(),
        });

        if (error) {
          console.error(`[enrichment] Error storing chunk: ${error.message}`);
        } else {
          insertedCount++;
        }
      } catch (error: any) {
        console.error(`[enrichment] Error processing chunk: ${error.message}`);
      }
    }

    console.log(`[enrichment] Enriched event ${eventId}: ${insertedCount} chunks inserted`);
    return insertedCount;
  }
}

/**
 * Get enrichment configuration from environment variables
 */
export function getEnrichmentConfig(): EnrichmentConfig {
  const enabled: string[] = [];

  if (process.env.ENRICHMENT_WEB_SEARCH_ENABLED === 'true') {
    enabled.push('web_search');
  }
  if (process.env.ENRICHMENT_DOCUMENT_EXTRACTION_ENABLED === 'true') {
    enabled.push('document_extractor');
  }
  if (process.env.ENRICHMENT_WIKIPEDIA_ENABLED === 'true') {
    enabled.push('wikipedia');
  }

  return {
    enabled,
    webSearch: process.env.ENRICHMENT_WEB_SEARCH_ENABLED === 'true'
      ? {
          provider: (process.env.ENRICHMENT_WEB_SEARCH_PROVIDER as 'serpapi' | 'google' | 'bing') || 'serpapi',
          apiKey: process.env.ENRICHMENT_WEB_SEARCH_API_KEY || '',
          maxResults: parseInt(process.env.ENRICHMENT_WEB_SEARCH_MAX_RESULTS || '20', 10),
        }
      : undefined,
    documentExtraction: process.env.ENRICHMENT_DOCUMENT_EXTRACTION_ENABLED === 'true'
      ? { enabled: true }
      : undefined,
    wikipedia: process.env.ENRICHMENT_WIKIPEDIA_ENABLED === 'true'
      ? {
          enabled: true,
          maxArticles: parseInt(process.env.ENRICHMENT_WIKIPEDIA_MAX_ARTICLES || '5', 10),
        }
      : undefined,
  };
}

