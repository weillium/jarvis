import type OpenAI from 'openai';
import type { WorkerSupabaseClient } from './supabase-orchestrator';

export interface GenerationContext {
  eventId: string;
  agentId: string;
  blueprintId: string;
}

export interface PhaseOptions {
  supabase: WorkerSupabaseClient;
  openai: OpenAI;
  genModel: string;
  stubResearchModel?: string;
  embedModel?: string;
  exaApiKey?: string;
}

export interface PhaseLogger {
  log: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

