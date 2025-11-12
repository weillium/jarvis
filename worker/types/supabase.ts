import type { AgentType } from './session';

export type AgentTransport = 'realtime' | 'stateless';

export interface CheckpointRecord {
  agent_type: AgentType;
  last_seq_processed: number;
}

export interface AgentStatusRecord {
  status: string;
  stage: string | null;
  model_set: string | null;
}

export interface AgentRecord {
  id: string;
  event_id: string;
  status: string;
}

export interface AgentSummaryRecord {
  id: string;
  status: string;
  stage: string | null;
  model_set: string | null;
}

export interface AgentSessionRecord {
  id: string;
  agent_type: AgentType;
  status: string;
  transport: AgentTransport;
  provider_session_id?: string | null;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  model?: string | null;
  connection_count?: number;
  last_connected_at?: string | null;
}

export interface AgentSessionUpsert {
  event_id: string;
  agent_id: string;
  provider_session_id: string;
  agent_type: AgentType;
  status: string;
  transport: AgentTransport;
  model?: string;
}

export interface AgentSessionHistoryParams {
  agent_session_id: string;
  event_id: string;
  agent_id: string;
  agent_type: AgentType;
  event_type: 'connected' | 'disconnected' | 'paused' | 'resumed' | 'error' | 'closed';
  provider_session_id?: string;
  previous_status?: string;
  new_status?: string;
  connection_count?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
  transport?: AgentTransport;
}

export interface InsertTranscriptParams {
  event_id: string;
  seq: number;
  text: string;
  at_ms: number;
  final: boolean;
  speaker?: string | null;
}

export interface TranscriptRecord {
  id: number;
  event_id: string;
  seq: number;
  at_ms: number;
  speaker: string | null;
  text: string;
  final: boolean;
}

export interface GlossaryRecord {
  term: string;
  definition: string;
  acronym_for: string | null;
  category: string | null;
  usage_examples: string[];
  related_terms: string[];
  confidence_score: number;
}

export interface AgentOutputRecord {
  id?: string;
  event_id: string;
  agent_id: string;
  agent_type: AgentType;
  for_seq: number;
  type: 'card' | 'fact_update';
  payload: unknown;
}

export interface CardStateRecord {
  event_id: string;
  card_id: string;
  card_kind: string | null;
  card_type: string | null;
  payload: unknown;
  source_seq: number | null;
  last_seen_seq: number;
  sources: number[];
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FactRecord {
  event_id: string;
  fact_key: string;
  fact_value: unknown;
  confidence: number;
  last_seen_seq: number;
  sources: number[];
  is_active?: boolean;
  merge_provenance?: string[];
  merged_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  dormant_at?: string | null;
  pruned_at?: string | null;
  normalized_hash?: string | null;
}

export interface VectorMatchRecord {
  id: string;
  chunk: string;
  similarity: number;
}

export interface GenerationCycleMetadataRecord {
  metadata: Record<string, unknown> | null;
}

export interface ContextBlueprintRecord {
  id: string;
  status: string;
  blueprint: unknown;
  error_message?: string | null;
}

export interface ResearchResultInsert {
  event_id: string;
  blueprint_id: string;
  generation_cycle_id: string;
  query: string;
  api: string;
  content: string;
  source_url?: string | null;
  quality_score: number;
  metadata: Record<string, unknown>;
}
