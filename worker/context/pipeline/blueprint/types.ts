import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { OpenAIUsage } from '../../../lib/pricing';

export type WorkerSupabaseClient = SupabaseClient;

export interface Blueprint {
  important_details: string[];
  inferred_topics: string[];
  key_terms: string[];
  audience_profile: {
    audience_summary: string;
    primary_roles: string[];
    core_needs: string[];
    desired_outcomes: string[];
    tone_and_voice: string;
    cautionary_notes: string[];
  };
  research_plan: {
    queries: Array<{
      query: string;
      api: 'exa' | 'wikipedia';
      priority: number;
      estimated_cost?: number;
      agent_utility: Array<'facts' | 'cards' | 'glossary'>;
      provenance_hint: string;
    }>;
    total_searches: number;
    estimated_total_cost: number;
  };
  glossary_plan: {
    terms: Array<{
      term: string;
      is_acronym: boolean;
      category: string;
      priority: number;
      agent_utility: Array<'facts' | 'cards'>;
    }>;
    estimated_count: number;
  };
  chunks_plan: {
    sources: Array<{
      label: string;
      upstream_reference: string;
      expected_format: string;
      priority: number;
      estimated_chunks: number;
      agent_utility: Array<'facts' | 'cards'>;
    }>;
    target_count: number;
    quality_tier: 'basic' | 'comprehensive';
    ranking_strategy: string;
  };
  cost_breakdown: {
    research: number;
    glossary: number;
    chunks: number;
    total: number;
  };
  agent_alignment: {
    facts: {
      highlights: string[];
      open_questions: string[];
    };
    cards: {
      assets: string[];
      open_questions: string[];
    };
  };
}

export interface BlueprintGeneratorOptions {
  supabase: WorkerSupabaseClient;
  openai: OpenAI;
  genModel: string;
}

export type BlueprintWithUsage = Blueprint & {
  usage?: OpenAIUsage | null;
};

export interface BlueprintPromptPreview {
  systemPrompt: string;
  userPrompt: string;
  event: {
    title: string;
    topic: string;
    hasDocuments: boolean;
    documentCount: number;
  };
}

export type SupabaseErrorLike = { message: string } | null;

export interface SupabaseMutationResult {
  error: SupabaseErrorLike;
}

export interface SupabaseSingleResult<T> {
  data: T | null;
  error: SupabaseErrorLike;
}

export interface SupabaseListResult<T> {
  data: T[] | null;
  error: SupabaseErrorLike;
}

