import type { GlossaryTermDefinition } from '../../../lib/context-normalization';

export type AgentUtilityTargets = Array<'facts' | 'cards' | 'glossary'>;

export interface ResearchChunkMetadata {
  api?: string;
  query?: string;
  url?: string | null;
  research_id?: string;
  method?: string;
  quality_score?: number;
  priority?: number;
  query_priority?: number;
  provenance_hint?: string | null;
  agent_utility?: AgentUtilityTargets;
  [key: string]: unknown;
}

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
  agent_utility: Array<'facts' | 'cards'>;
}

export interface GlossaryCostBreakdown {
  openai: {
    total: number;
    chat_completions: Array<{
      term?: string;
      cost: number;
      usage: {
        prompt_tokens: number;
        completion_tokens?: number | null;
        total_tokens: number;
      };
      model: string;
    }>;
  };
  exa: {
    total: number;
    answer: {
      cost: number;
      queries: number;
      calls: Array<{
        term: string;
        cost: number;
      }>;
    };
  };
}

