import type { TokenMetrics, RuntimeStats } from '@/shared/hooks/use-agent-sessions-query';
import type { AgentSessionSSEEnrichment } from '@/shared/hooks/use-agent-sessions';

export type AgentType = 'transcript' | 'cards' | 'facts';

export interface AgentSessionDisplay {
  agent_type: AgentType;
  transport: 'realtime' | 'stateless';
  session_id: string;
  status: 'active' | 'paused' | 'closed' | 'error';
  metadata: {
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    model?: string;
    connection_count: number;
    last_connected_at: string | null;
  };
  token_metrics?: TokenMetrics;
  runtime_stats?: RuntimeStats;
  metrics_recorded_at?: string;
  websocket_state?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  ping_pong?: AgentSessionSSEEnrichment['ping_pong'];
  recent_logs?: AgentSessionSSEEnrichment['recent_logs'];
}

export const agentTitles: Record<AgentType, string> = {
  transcript: 'Transcript Agent',
  cards: 'Cards Agent',
  facts: 'Facts Agent',
};

export const defaultAgentModels: Record<AgentType, string> = {
  transcript: 'gpt-4o-realtime-preview',
  cards: 'gpt-5-mini',
  facts: 'gpt-5-mini',
};

export const DEFAULT_PROMPT_SHARE = 0.5;

export const getSessionStatusColor = (status: string): string => {
  switch (status) {
    case 'active':
      return '#10b981';
    case 'paused':
      return '#8b5cf6';
    case 'closed':
      return '#6b7280';
    case 'error':
      return '#ef4444';
    default:
      return '#6b7280';
  }
};

export const getSessionStatusLabel = (status: string): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'closed':
      return 'Closed';
    case 'error':
      return 'Error';
    default:
      return status;
  }
};

export const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
};

export const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (totalHours > 0) {
    return `${totalHours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

export const coerceNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const inferPromptShareFromMetrics = (metrics?: TokenMetrics): number => {
  const breakdown = metrics?.last_request?.breakdown as Record<string, unknown> | undefined;
  if (!breakdown) {
    return DEFAULT_PROMPT_SHARE;
  }

  const promptEstimate =
    coerceNumber(breakdown.prompt) +
    coerceNumber(breakdown.input) +
    coerceNumber(breakdown.prompt_tokens);

  const completionEstimate =
    coerceNumber(breakdown.completion) +
    coerceNumber(breakdown.output) +
    coerceNumber(breakdown.completion_tokens);

  const total = promptEstimate + completionEstimate;
  if (total > 0) {
    return Math.min(Math.max(promptEstimate / total, 0), 1);
  }

  return DEFAULT_PROMPT_SHARE;
};

