export type AgentType = 'cards' | 'facts';

export type SessionStatus =
  | 'active'
  | 'paused'
  | 'closed'
  | 'error';

export interface LogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
  timestamp: string;
  context?: {
    seq?: number;
    agent_type?: AgentType;
    event_id?: string;
  };
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
    cards_last_seq: number;
    facts_last_seq: number;
    facts_last_update: string;
    ring_buffer_stats: any;
    facts_store_stats: any;
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
  };
}
