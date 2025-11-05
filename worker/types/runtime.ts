import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { RingBuffer, TranscriptChunk } from '../ring-buffer';
import type { FactsStore, Fact } from '../facts-store';
import type { RealtimeSession } from '../realtime-session';
import type { LogEntry } from './session';

export type EventRuntimeStatus =
  | 'prepping'
  | 'context_complete'
  | 'ready'
  | 'running'
  | 'ended'
  | 'error';

export interface GlossaryEntry {
  term: string;
  definition: string;
  acronym_for?: string;
  category?: string;
  usage_examples?: string[];
  related_terms?: string[];
  confidence_score?: number;
}

export interface EventRuntime {
  eventId: string;
  agentId: string;
  status: EventRuntimeStatus;

  // In-memory state
  ringBuffer: RingBuffer;
  factsStore: FactsStore;
  glossaryCache?: Map<string, GlossaryEntry>;

  // Realtime sessions
  cardsSession?: RealtimeSession;
  factsSession?: RealtimeSession;
  cardsSessionId?: string;
  factsSessionId?: string;

  // Checkpoints
  cardsLastSeq: number;
  factsLastSeq: number;

  // Debouncing for Facts agent
  factsUpdateTimer?: NodeJS.Timeout;
  factsLastUpdate: number;

  // Context metrics tracking
  contextMetrics?: {
    cards: {
      total: number;
      count: number;
      max: number;
      warnings: number;
      criticals: number;
    };
    facts: {
      total: number;
      count: number;
      max: number;
      warnings: number;
      criticals: number;
    };
  };

  // Log buffers for each agent
  logBuffers?: {
    cards: LogEntry[];
    facts: LogEntry[];
  };

  // Periodic summary timer
  summaryTimer?: NodeJS.Timeout;

  // Status update timer
  statusUpdateTimer?: NodeJS.Timeout;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface OrchestratorConfig {
  supabase: SupabaseClient;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  realtimeModel: string;
  sseEndpoint?: string;
}

export type { TranscriptChunk, Fact };
