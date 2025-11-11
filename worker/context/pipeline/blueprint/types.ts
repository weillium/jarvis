import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { OpenAIUsage } from '../pricing-config';

export type WorkerSupabaseClient = SupabaseClient;

export interface Blueprint {
  important_details: string[];
  inferred_topics: string[];
  key_terms: string[];
  research_plan: {
    queries: Array<{
      query: string;
      api: 'exa' | 'wikipedia';
      priority: number;
      estimated_cost?: number;
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
    }>;
    estimated_count: number;
  };
  chunks_plan: {
    sources: Array<{
      source: string;
      priority: number;
      estimated_chunks: number;
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

