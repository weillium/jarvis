/**
 * Base Enricher Interface
 * All enrichers must extend this class
 */

import type { EnrichmentResult } from '../types';

export abstract class BaseEnricher {
  abstract name: string;

  /**
   * Enrich context for an event
   * Returns an array of enrichment results, each containing chunks and metadata
   */
  abstract enrich(
    eventId: string,
    eventTitle: string,
    eventTopic: string | null
  ): Promise<EnrichmentResult[]>;

  /**
   * Optional: Configure chunking strategy
   * Returns 'semantic' for intelligent chunking, 'fixed' for fixed-size chunks
   */
  getChunkingStrategy(): 'semantic' | 'fixed' {
    return 'semantic';
  }

  /**
   * Optional: Configure quality scoring
   * Returns a score 0-1 indicating chunk quality
   */
  getQualityScore(chunk: string, metadata: any): number {
    return 0.5; // Default quality score
  }
}

