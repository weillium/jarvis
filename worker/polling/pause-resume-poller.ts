import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Poller } from './base-poller';
import type { Orchestrator } from '../core/orchestrator';

type LoggerFn = (...args: unknown[]) => void;

interface AgentSessionRow {
  event_id: string;
  agent_id: string;
}

interface AgentStatusRow {
  status: string;
  stage: string | null;
}

export class PauseResumePoller implements Poller {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly orchestrator: Orchestrator,
    private readonly log: LoggerFn = console.log
  ) {}

  async tick(): Promise<void> {
    const pausedSessionsQuery = this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id')
      .eq('status', 'paused')
      .limit(50);
    const pausedSessionsResponse: PostgrestResponse<AgentSessionRow> = await pausedSessionsQuery;

    const { data: pausedSessions, error: pausedError } = pausedSessionsResponse;

    if (pausedError) {
      this.log('[pause-resume] fetch error:', pausedError.message);
      return;
    }

    if (!pausedSessions || pausedSessions.length === 0) {
      return;
    }

    const eventsToPause = new Map<string, string>();
    for (const session of pausedSessions) {
      if (!eventsToPause.has(session.event_id)) {
        eventsToPause.set(session.event_id, session.agent_id);
      }
    }

    for (const [eventId] of eventsToPause) {
      try {
        const runtime = this.orchestrator.getRuntime(eventId);
        if (runtime && runtime.status === 'running') {
          const cardsActive = runtime.cardsSession?.getStatus().isActive;
          const factsActive = runtime.factsSession?.getStatus().isActive;

          if (cardsActive || factsActive) {
            this.log('[pause-resume] Pausing event', eventId, '- sessions are still active');
            await this.orchestrator.pauseEvent(eventId);
          }
        }
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      }
    }

    const pausedForResumeQuery = this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id')
      .eq('status', 'paused')
      .limit(50);
    const pausedForResumeResponse: PostgrestResponse<AgentSessionRow> = await pausedForResumeQuery;

    const { data: pausedForResume, error: pausedError2 } = pausedForResumeResponse;

    if (pausedError2 || !pausedForResume || pausedForResume.length === 0) {
      return;
    }

    const eventsToResume = new Map<string, string>();
    for (const session of pausedForResume) {
      const agentQuery = this.supabase
        .from('agents')
        .select('status, stage')
        .eq('id', session.agent_id)
        .single();
      const agentResponse: PostgrestSingleResponse<AgentStatusRow> = await agentQuery;
      const { data: agent } = agentResponse;

      if (agent && agent.status === 'active' && agent.stage === 'running') {
        if (!eventsToResume.has(session.event_id)) {
          eventsToResume.set(session.event_id, session.agent_id);
        }
      }
    }

    for (const [eventId, agentId] of eventsToResume) {
      try {
        this.log('[pause-resume] Resuming event', eventId);
        await this.orchestrator.resumeEvent(eventId, agentId);
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      }
    }
  }

  getInterval(): number {
    return 5000;
  }
}
