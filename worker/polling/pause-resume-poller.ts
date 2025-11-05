import { Poller } from './base-poller';
import { Orchestrator } from '../core/orchestrator';

type LoggerFn = (...args: any[]) => void;

export class PauseResumePoller implements Poller {
  constructor(
    private readonly supabase: any,
    private readonly orchestrator: Orchestrator,
    private readonly log: LoggerFn = console.log
  ) {}

  async tick(): Promise<void> {
    const { data: pausedSessions, error: pausedError } = await this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id')
      .eq('status', 'paused')
      .limit(50);

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
      } catch (err: any) {
        this.log('[pause-resume] error pausing event', eventId, err?.message || err);
      }
    }

    const { data: pausedForResume, error: pausedError2 } = await this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id')
      .eq('status', 'paused')
      .limit(50);

    if (pausedError2 || !pausedForResume || pausedForResume.length === 0) {
      return;
    }

    const eventsToResume = new Map<string, string>();
    for (const session of pausedForResume) {
      const { data: agent } = await this.supabase
        .from('agents')
        .select('status')
        .eq('id', session.agent_id)
        .single();

      if (agent && agent.status === 'running') {
        if (!eventsToResume.has(session.event_id)) {
          eventsToResume.set(session.event_id, session.agent_id);
        }
      }
    }

    for (const [eventId, agentId] of eventsToResume) {
      try {
        this.log('[pause-resume] Resuming event', eventId);
        await this.orchestrator.resumeEvent(eventId, agentId);
      } catch (err: any) {
        this.log('[pause-resume] error resuming event', eventId, err?.message || err);
      }
    }
  }

  getInterval(): number {
    return 5000;
  }
}
