import type { AgentType } from '../../types';

export interface CheckpointRecord {
  agent_type: AgentType;
  last_seq_processed: number;
}

export interface AgentStatusRecord {
  status: string;
  stage: string | null;
  model_set?: string;
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
  provider_session_id?: string;
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
  metadata?: Record<string, any>;
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
  event_id: string;
  agent_id: string;
  agent_type: AgentType;
  for_seq: number;
  type: 'card' | 'fact_update';
  payload: any;
}

export interface FactRecord {
  event_id: string;
  fact_key: string;
  fact_value: any;
  confidence: number;
  last_seen_seq: number;
  sources: number[];
  is_active?: boolean;
}
