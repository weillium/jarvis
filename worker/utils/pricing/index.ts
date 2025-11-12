/**
 * Centralized Pricing Configuration
 *
 * Shared between worker and web packages.
 * Update this file when pricing changes occur.
 */

export interface OpenAIPricing {
  [model: string]: {
    inputPricePer1k: number;
    outputPricePer1k: number;
    embeddingPricePer1k?: number;
  };
}

export interface ExaPricing {
  search: {
    pricePerQuery: number;
  };
  research: {
    pricePer1kSearches: number;
    pricePer1kPages: number;
    pricePer1MTokens: number;
  };
  answer: {
    pricePerQuery: number;
  };
  contents?: {
    pricePerPage?: number;
  };
}

export interface PricingConfig {
  openai: OpenAIPricing;
  exa: ExaPricing;
  lastUpdated: string;
  version: string;
}

const openaiPricing: OpenAIPricing = {
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
  o1: {
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
  o3: {
    inputPricePer1k: 0.002,
    outputPricePer1k: 0.008,
  },
  'o3-pro': {
    inputPricePer1k: 0.02,
    outputPricePer1k: 0.08,
  },
  'text-embedding-3-small': {
    inputPricePer1k: 0.00002,
    outputPricePer1k: 0.00002,
    embeddingPricePer1k: 0.00002,
  },
  'text-embedding-3-large': {
    inputPricePer1k: 0.00013,
    outputPricePer1k: 0.00013,
    embeddingPricePer1k: 0.00013,
  },
  'text-embedding-ada-002': {
    inputPricePer1k: 0.0001,
    outputPricePer1k: 0.0001,
    embeddingPricePer1k: 0.0001,
  },
};

const exaPricing: ExaPricing = {
  search: {
    pricePerQuery: 0.03,
  },
  research: {
    pricePer1kSearches: 5.0,
    pricePer1kPages: 5.0,
    pricePer1MTokens: 5.0,
  },
  answer: {
    pricePerQuery: 0.02,
  },
};

export const pricingConfig: PricingConfig = {
  openai: openaiPricing,
  exa: exaPricing,
  lastUpdated: '2025-11-09T00:00:00Z',
  version: '2025-11-09',
};

export interface OpenAIUsage {
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}

const DEFAULT_PROMPT_SHARE = 0.5;

export function calculateOpenAICost(
  usage: OpenAIUsage,
  model: string,
  isEmbedding: boolean = false
): number {
  const modelPricing = pricingConfig.openai[model];
  const totalTokens =
    usage.total_tokens ??
    ((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0));

  if (!modelPricing) {
    console.warn(`[pricing] No pricing found for model "${model}", using default pricing`);
    const fallbackPromptTokens = usage.prompt_tokens ?? totalTokens * DEFAULT_PROMPT_SHARE;
    const fallbackCompletionTokens =
      usage.completion_tokens ?? Math.max(totalTokens - fallbackPromptTokens, 0);

    return (
      (fallbackPromptTokens / 1000) * 0.00015 +
      (fallbackCompletionTokens / 1000) * 0.0006
    );
  }

  if (isEmbedding && modelPricing.embeddingPricePer1k) {
    return (totalTokens / 1000) * modelPricing.embeddingPricePer1k;
  }

  let promptTokens = usage.prompt_tokens;
  let completionTokens = usage.completion_tokens;

  if (promptTokens === undefined && completionTokens === undefined) {
    promptTokens = totalTokens * DEFAULT_PROMPT_SHARE;
    completionTokens = totalTokens - promptTokens;
  } else {
    if (promptTokens === undefined) {
      promptTokens = Math.max(totalTokens - (completionTokens ?? 0), 0);
    }
    if (completionTokens === undefined) {
      completionTokens = Math.max(totalTokens - (promptTokens ?? 0), 0);
    }
  }

  const inputCost = (promptTokens / 1000) * modelPricing.inputPricePer1k;
  const outputCost = (completionTokens / 1000) * modelPricing.outputPricePer1k;

  return inputCost + outputCost;
}

export function calculateExaSearchCost(queryCount: number): number {
  return queryCount * pricingConfig.exa.search.pricePerQuery;
}

export function calculateExaResearchCost(usage: {
  searches?: number;
  pages?: number;
  tokens?: number;
}): number {
  const { searches = 0, pages = 0, tokens = 0 } = usage;

  const searchCost = (searches / 1000) * pricingConfig.exa.research.pricePer1kSearches;
  const pageCost = (pages / 1000) * pricingConfig.exa.research.pricePer1kPages;
  const tokenCost = (tokens / 1_000_000) * pricingConfig.exa.research.pricePer1MTokens;

  return searchCost + pageCost + tokenCost;
}

export function calculateExaAnswerCost(queryCount: number): number {
  return queryCount * pricingConfig.exa.answer.pricePerQuery;
}

export function getPricingVersion(): string {
  return pricingConfig.version;
}

export function getPricingLastUpdated(): string {
  return pricingConfig.lastUpdated;
}

type CostRequest =
  | {
      provider: 'openai';
      model: string;
      usage: OpenAIUsage;
      isEmbedding?: boolean;
    }
  | {
      provider: 'exa';
      kind: 'search';
      queryCount: number;
    }
  | {
      provider: 'exa';
      kind: 'research';
      usage: {
        searches?: number;
        pages?: number;
        tokens?: number;
      };
    }
  | {
      provider: 'exa';
      kind: 'answer';
      queryCount: number;
    };

export function calculateCost(request: CostRequest): number {
  if (request.provider === 'openai') {
    return calculateOpenAICost(request.usage, request.model, request.isEmbedding);
  }

  if (request.kind === 'search') {
    return calculateExaSearchCost(request.queryCount);
  }

  if (request.kind === 'answer') {
    return calculateExaAnswerCost(request.queryCount);
  }

  return calculateExaResearchCost(request.usage);
}

