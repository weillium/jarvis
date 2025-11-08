import type { GlossaryTermDefinition } from '../../../lib/context-normalization';

export type ResearchChunkMetadata = {
  api?: string;
  quality_score?: number;
} & Record<string, unknown>;

export interface ResearchResults {
  chunks: Array<{
    text: string;
    source: string;
    metadata?: ResearchChunkMetadata;
  }>;
}

export type TermDefinition = GlossaryTermDefinition;

export interface GlossaryPlanTerm {
  term: string;
  is_acronym: boolean;
  category: string;
  priority: number;
}

export interface GlossaryCostBreakdown {
  openai: {
    total: number;
    chat_completions: Array<{ cost: number; usage: { prompt_tokens: number; completion_tokens?: number | null; total_tokens: number }; model: string }>;
  };
  exa: {
    total: number;
    answer: { cost: number; queries: number };
  };
}

