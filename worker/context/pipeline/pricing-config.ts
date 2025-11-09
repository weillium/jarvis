/**
 * Centralized Pricing Configuration
 * 
 * This file contains pricing tables for all external APIs used in the system.
 * Update this file when pricing changes occur.
 * 
 * Pricing is stored in USD per unit (per 1k tokens, per query, etc.)
 */

export interface OpenAIPricing {
  [model: string]: {
    inputPricePer1k: number;  // Price per 1,000 input tokens
    outputPricePer1k: number; // Price per 1,000 output tokens
    embeddingPricePer1k?: number; // For embedding models (price per 1k tokens)
  };
}

export interface ExaPricing {
  search: {
    pricePerQuery: number; // Price per search query
  };
  research: {
    pricePer1kSearches: number;    // Price per 1,000 searches
    pricePer1kPages: number;        // Price per 1,000 pages read
    pricePer1MTokens: number;       // Price per 1M reasoning tokens
  };
  answer: {
    pricePerQuery: number; // Price per answer query
  };
  contents?: {
    pricePerPage?: number; // Price per page (if used)
  };
}

export interface PricingConfig {
  openai: OpenAIPricing;
  exa: ExaPricing;
  lastUpdated: string; // ISO timestamp of last update
  version: string;     // Version identifier for tracking
}

/**
 * OpenAI Pricing Table
 * 
 * Prices are in USD per 1,000 tokens
 * Updated: 2025-11-09
 * Source: https://openai.com/api/pricing/
 */
const openaiPricing: OpenAIPricing = {
  // GPT-5 family (Flagship models)
  'gpt-5': {
    inputPricePer1k: 0.00125,
    outputPricePer1k: 0.01,
  },
  'gpt-5-mini': {
    inputPricePer1k: 0.00025,
    outputPricePer1k: 0.002,
  },
  'gpt-5-nano': {
    inputPricePer1k: 0.00005,
    outputPricePer1k: 0.0004,
  },
  'gpt-5-chat-latest': {
    inputPricePer1k: 0.00125,
    outputPricePer1k: 0.01,
  },
  'gpt-5-codex': {
    inputPricePer1k: 0.00125,
    outputPricePer1k: 0.01,
  },
  'gpt-5-pro': {
    inputPricePer1k: 0.015,
    outputPricePer1k: 0.12,
  },

  // GPT-4.1 family
  'gpt-4.1': {
    inputPricePer1k: 0.002,
    outputPricePer1k: 0.008,
  },
  'gpt-4.1-mini': {
    inputPricePer1k: 0.0004,
    outputPricePer1k: 0.0016,
  },
  'gpt-4.1-nano': {
    inputPricePer1k: 0.0001,
    outputPricePer1k: 0.0004,
  },

  // GPT-4o family
  'gpt-4o': {
    inputPricePer1k: 0.0025,
    outputPricePer1k: 0.01,
  },
  'gpt-4o-2024-05-13': {
    inputPricePer1k: 0.005,
    outputPricePer1k: 0.015,
  },
  'gpt-4o-mini': {
    inputPricePer1k: 0.00015,
    outputPricePer1k: 0.0006,
  },

  // Realtime & audio-capable models
  'gpt-realtime': {
    inputPricePer1k: 0.004,
    outputPricePer1k: 0.016,
  },
  'gpt-realtime-mini': {
    inputPricePer1k: 0.0006,
    outputPricePer1k: 0.0024,
  },
  'gpt-4o-realtime-preview': {
    inputPricePer1k: 0.005,
    outputPricePer1k: 0.02,
  },
  'gpt-4o-realtime-preview-2024-10-01': {
    inputPricePer1k: 0.005,
    outputPricePer1k: 0.02,
  },
  'gpt-4o-mini-realtime-preview': {
    inputPricePer1k: 0.0006,
    outputPricePer1k: 0.0024,
  },
  'gpt-audio': {
    inputPricePer1k: 0.0025,
    outputPricePer1k: 0.01,
  },
  'gpt-audio-mini': {
    inputPricePer1k: 0.0006,
    outputPricePer1k: 0.0024,
  },
  'gpt-4o-audio-preview': {
    inputPricePer1k: 0.0025,
    outputPricePer1k: 0.01,
  },
  'gpt-4o-mini-audio-preview': {
    inputPricePer1k: 0.00015,
    outputPricePer1k: 0.0006,
  },

  // Legacy GPT-4 family still in rotation
  'gpt-4-turbo': {
    inputPricePer1k: 0.01,
    outputPricePer1k: 0.03,
  },
  'chatgpt-4o-latest': {
    inputPricePer1k: 0.005,
    outputPricePer1k: 0.015,
  },
  'gpt-3.5-turbo': {
    inputPricePer1k: 0.0005,
    outputPricePer1k: 0.0015,
  },

  // Reasoning models
  'o1': {
    inputPricePer1k: 0.015,
    outputPricePer1k: 0.06,
  },
  'o1-preview': {
    inputPricePer1k: 0.015,
    outputPricePer1k: 0.06,
  },
  'o1-mini': {
    inputPricePer1k: 0.0011,
    outputPricePer1k: 0.0044,
  },
  'o1-pro': {
    inputPricePer1k: 0.15,
    outputPricePer1k: 0.6,
  },
  'o3': {
    inputPricePer1k: 0.002,
    outputPricePer1k: 0.008,
  },
  'o3-pro': {
    inputPricePer1k: 0.02,
    outputPricePer1k: 0.08,
  },

  // Embedding models (Cost per 1M tokens → per 1k tokens)
  'text-embedding-3-small': {
    inputPricePer1k: 0.00002,
    outputPricePer1k: 0.00002,
    embeddingPricePer1k: 0.00002, // Batch pricing: $0.00001 per 1k tokens
  },
  'text-embedding-3-large': {
    inputPricePer1k: 0.00013,
    outputPricePer1k: 0.00013,
    embeddingPricePer1k: 0.00013, // Batch pricing: $0.000065 per 1k tokens
  },
  'text-embedding-ada-002': {
    inputPricePer1k: 0.0001,
    outputPricePer1k: 0.0001,
    embeddingPricePer1k: 0.0001, // Batch pricing: $0.00005 per 1k tokens
  },
};

/**
 * Exa Pricing Table
 * 
 * Prices are in USD
 * Updated: 2025-11-04
 * Source: https://exa.ai/pricing (or Exa dashboard)
 */
const exaPricing: ExaPricing = {
  search: {
    pricePerQuery: 0.03, // ~$0.02-0.04 per search query (average)
  },
  research: {
    pricePer1kSearches: 5.0,    // $5 per 1,000 searches
    pricePer1kPages: 5.0,       // $5 per 1,000 pages read
    pricePer1MTokens: 5.0,      // $5 per 1M reasoning tokens
  },
  answer: {
    pricePerQuery: 0.02, // ~$0.01-0.03 per answer query (average)
  },
};

/**
 * Complete Pricing Configuration
 */
export const pricingConfig: PricingConfig = {
  openai: openaiPricing,
  exa: exaPricing,
  lastUpdated: '2025-11-09T00:00:00Z',
  version: '2025-11-09',
};

/**
 * Cost Calculation Functions
 */

/**
 * Calculate OpenAI cost from usage data
 */
export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens?: number;
  total_tokens: number;
}

export function calculateOpenAICost(
  usage: OpenAIUsage,
  model: string,
  isEmbedding: boolean = false
): number {
  const modelPricing = pricingConfig.openai[model];
  
  if (!modelPricing) {
    console.warn(`[pricing] No pricing found for model "${model}", using default pricing`);
    // Fallback to gpt-4o-mini pricing
    return (
      (usage.prompt_tokens / 1000) * 0.00015 +
      ((usage.completion_tokens ?? 0) / 1000) * 0.0006
    );
  }

  if (isEmbedding && modelPricing.embeddingPricePer1k) {
    // For embeddings, use embedding price per 1k tokens
    return (usage.total_tokens / 1000) * modelPricing.embeddingPricePer1k;
  }

  // For chat completions, use input/output pricing
  const inputCost = (usage.prompt_tokens / 1000) * modelPricing.inputPricePer1k;
  const completionTokens = usage.completion_tokens ?? 0;
  const outputCost = (completionTokens / 1000) * modelPricing.outputPricePer1k;
  
  return inputCost + outputCost;
}

/**
 * Calculate Exa search cost
 */
export function calculateExaSearchCost(queryCount: number): number {
  return queryCount * pricingConfig.exa.search.pricePerQuery;
}

/**
 * Calculate Exa research cost from usage data
 */
export function calculateExaResearchCost(usage: {
  searches?: number;
  pages?: number;
  tokens?: number;
}): number {
  const { searches = 0, pages = 0, tokens = 0 } = usage;
  
  const searchCost = (searches / 1000) * pricingConfig.exa.research.pricePer1kSearches;
  const pageCost = (pages / 1000) * pricingConfig.exa.research.pricePer1kPages;
  const tokenCost = (tokens / 1000000) * pricingConfig.exa.research.pricePer1MTokens;
  
  return searchCost + pageCost + tokenCost;
}

/**
 * Calculate Exa answer cost
 */
export function calculateExaAnswerCost(queryCount: number): number {
  return queryCount * pricingConfig.exa.answer.pricePerQuery;
}

/**
 * Get pricing config version
 */
export function getPricingVersion(): string {
  return pricingConfig.version;
}

/**
 * Get pricing last updated timestamp
 */
export function getPricingLastUpdated(): string {
  return pricingConfig.lastUpdated;
}
