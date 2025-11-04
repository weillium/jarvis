/**
 * Type definitions for the enrichment framework
 */

export interface EnrichmentResult {
  chunks: string[];
  metadata: Record<string, any>;
  source: string;
  qualityScore?: number;
}

export interface EnrichmentConfig {
  enabled: string[]; // List of enricher names to use
  webSearch?: {
    provider: 'serpapi' | 'google' | 'bing';
    apiKey: string;
    maxResults?: number;
  };
  documentExtraction?: {
    enabled: boolean;
  };
  wikipedia?: {
    enabled: boolean;
    maxArticles?: number;
  };
}

