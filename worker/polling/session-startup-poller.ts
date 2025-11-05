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
    const { data: startingSessions, error } = await this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id')
      .eq('status', 'starting')
      .limit(50);

    if (error) {
      this.log('[start-generated] fetch error:', error.message);
      return;
    }

    if (!startingSessions || startingSessions.length === 0) {
      return;
    }

    const eventsToStart = new Map<string, string>();
    for (const session of startingSessions) {
      if (!eventsToStart.has(session.event_id)) {
        eventsToStart.set(session.event_id, session.agent_id);
      }
    }

    for (const [eventId, agentId] of eventsToStart) {
      try {
        const runtime = this.orchestrator.getRuntime(eventId);
        if (
          runtime &&
          runtime.status === 'running' &&
          runtime.cardsSession &&
          runtime.factsSession
        ) {
          continue;
        }

        const { data: agent } = await this.supabase
          .from('agents')
          .select('status')
          .eq('id', agentId)
          .single();

        if (!agent || (agent.status !== 'testing' && agent.status !== 'running')) {
          continue;
        }

        if (agent.status === 'testing') {
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
