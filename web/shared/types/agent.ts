export type AgentStatus = 'prepping' | 'ready' | 'running' | 'ended' | 'error';

export interface Agent {
  id: string;
  event_id: string;
  status: AgentStatus;
  model: string;
  created_at: string;
}

