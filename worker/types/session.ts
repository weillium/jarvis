export type AgentType = 'transcript' | 'cards' | 'facts';

export type SessionStatus =
  | 'active'
  | 'paused'
  | 'closed'
  | 'error';

export interface LogContext extends Record<string, unknown> {
  seq?: number;
  agent_type?: AgentType;
  event_id?: string;
}

export interface LogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
  timestamp: string;
  context?: LogContext;
}

export interface AgentSessionStatus {
  agent_type: AgentType;
  session_id: string;
  status: SessionStatus;
  websocket_state?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  ping_pong?: {
    enabled: boolean;
    missedPongs: number;
    lastPongReceived?: string;
    pingIntervalMs: number;
    pongTimeoutMs: number;
    maxMissedPongs: number;
  };
  runtime: {
    event_id: string;
    agent_id: string;
    runtime_status: string;
    transcript_last_seq: number;
    cards_last_seq: number;
    facts_last_seq: number;
    facts_last_update: string;
    // TODO: narrow unknown -> RingBufferStats after upstream callsite analysis
    ring_buffer_stats: unknown;
    // TODO: narrow unknown -> FactsStoreStats after upstream callsite analysis
    facts_store_stats: unknown;
  };
  token_metrics: {
    total_tokens: number;
    request_count: number;
    max_tokens: number;
    avg_tokens: number;
    warnings: number;
    criticals: number;
    last_request?: {
      tokens: number;
      percentage: number;
      breakdown: Record<string, number>;
      timestamp: string;
    };
  };
  recent_logs: LogEntry[];
  metadata: {
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    model: string;
    connection_count?: number;
    last_connected_at?: string | null;
  };
}
