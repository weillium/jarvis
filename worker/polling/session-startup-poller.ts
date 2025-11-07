import { Poller } from './base-poller';
import { Orchestrator } from '../core/orchestrator';

type LoggerFn = (...args: any[]) => void;

export class SessionStartupPoller implements Poller {
  constructor(
    private readonly supabase: any,
    private readonly orchestrator: Orchestrator,
    private readonly log: LoggerFn = console.log
  ) {}

  async tick(): Promise<void> {
    // Find closed sessions created in the last minute (new sessions ready to start)
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: pendingSessions, error } = await this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id, status, created_at, updated_at, provider_session_id')
      .eq('status', 'active')
      .eq('provider_session_id', 'pending')
      .limit(50);

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

        const { data: agent } = await this.supabase
          .from('agents')
          .select('status, stage')
          .eq('id', agentId)
          .single();

        if (!agent || agent.status !== 'active') {
          continue;
        }

        const allowedStages = ['testing', 'running'];
        if (!allowedStages.includes(agent.stage)) {
          continue;
        }

        if (agent.stage === 'testing') {
          this.log('[start-generated] Starting sessions for testing (event:', eventId, ')');
          await this.orchestrator.startSessionsForTesting(eventId, agentId);
        } else {
          this.log('[start-generated] Starting event', eventId, 'with generated sessions');
          await this.orchestrator.startEvent(eventId, agentId);
        }
      } catch (err: any) {
        this.log('[start-generated] error starting event', eventId, err?.message || err);
      }
    }
  }

  getInterval(): number {
    return 5000;
  }
}
