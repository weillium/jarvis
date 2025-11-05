import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { RingBuffer, TranscriptChunk } from '../ring-buffer';
import type { FactsStore, Fact } from '../facts-store';
import type { RealtimeSession } from '../realtime-session';
import type { SupabaseService } from '../services/supabase-service';
import type { OpenAIService } from '../services/openai-service';
import type { SSEService } from '../services/sse-service';

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
  supabaseService?: SupabaseService;
  openaiService?: OpenAIService;
  sseService?: SSEService;
}

export type { TranscriptChunk, Fact };
