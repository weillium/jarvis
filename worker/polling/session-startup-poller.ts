import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Poller } from './base-poller';
import type { Orchestrator } from '../runtime/orchestrator';

type LoggerFn = (...args: unknown[]) => void;

interface AgentSessionRow {
  event_id: string;
  agent_id: string;
  status: string;
  provider_session_id: string | null;
}

interface AgentRow {
  status: string;
  stage: string | null;
}

export class SessionStartupPoller implements Poller {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly orchestrator: Orchestrator,
    private readonly log: LoggerFn = console.log
  ) {}

  async tick(): Promise<void> {
    const sessionsQuery = this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id, status, created_at, updated_at, provider_session_id')
      .eq('status', 'active')
      .eq('provider_session_id', 'pending')
      .limit(50);
    const response: PostgrestResponse<AgentSessionRow> = await sessionsQuery;

    const { data: pendingSessions, error } = response;

    if (error) {
      this.log('[start-generated] fetch error:', error.message);
      return;
    }

    if (!pendingSessions || pendingSessions.length === 0) {
      return;
    }

    const eventsToStart = new Map<string, string>();
    for (const session of pendingSessions) {
      if (!eventsToStart.has(session.event_id)) {
        eventsToStart.set(session.event_id, session.agent_id);
      }
    }

    for (const [eventId, agentId] of eventsToStart) {
      try {
        const runtime = this.orchestrator.getRuntime(eventId);
        if (runtime && runtime.status === 'running') {
          const transcriptActive = runtime.transcriptSession?.getStatus().isActive;
          const cardsActive = runtime.cardsSession?.getStatus().isActive;
          const factsActive = runtime.factsSession?.getStatus().isActive;

          if (transcriptActive || cardsActive || factsActive) {
            continue;
          }
        }

        const agentQuery = this.supabase
          .from('agents')
          .select('status, stage')
          .eq('id', agentId)
          .single();
        const agentResponse: PostgrestSingleResponse<AgentRow> = await agentQuery;
        const { data: agent } = agentResponse;

        if (!agent || agent.status !== 'active') {
          continue;
        }

        const stage = agent.stage;
        if (!stage) {
          continue;
        }

        const allowedStages = ['testing', 'running'];
        if (!allowedStages.includes(stage)) {
          continue;
        }

        if (stage === 'testing') {
          this.log('[start-generated] Starting sessions for testing (event:', eventId, ')');
          await this.orchestrator.startSessionsForTesting(eventId, agentId);
        } else {
          this.log('[start-generated] Starting event', eventId, 'with generated sessions');
          await this.orchestrator.startEvent(eventId, agentId);
        }
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      }
    }
  }

  getInterval(): number {
    return 5000;
  }
}
