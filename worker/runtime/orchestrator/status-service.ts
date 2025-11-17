import type { RuntimeManager } from '../runtime-manager';
import type { StatusUpdater } from '../../services/observability/status-updater';
import type { AgentSessionStatus, EventRuntime } from '../../types';

export class OrchestratorStatusService {
  constructor(
    private readonly runtimeManager: RuntimeManager,
    private readonly statusUpdater: StatusUpdater
  ) {}

  getRuntime(eventId: string): EventRuntime | undefined {
    return this.runtimeManager.getRuntime(eventId);
  }

  getSessionStatus(eventId: string): {
    transcript: AgentSessionStatus | null;
    cards: AgentSessionStatus | null;
    facts: AgentSessionStatus | null;
  } {
    const runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      return { transcript: null, cards: null, facts: null };
    }

    const statuses = this.statusUpdater.getRuntimeStatusSnapshot(runtime);
    return {
      transcript: statuses.transcript,
      cards: statuses.cards,
      facts: statuses.facts,
    };
  }
}

