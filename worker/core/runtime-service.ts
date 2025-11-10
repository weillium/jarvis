import type { RuntimeManager } from './runtime-manager';
import type { StatusUpdater } from '../monitoring/status-updater';
import type { SessionLifecycle } from './session-lifecycle';
import type { EventProcessor } from './event-processor';
import type { EventRuntime } from '../types';
import type { AgentsRepository } from '../services/supabase/agents-repository';

export class RuntimeService {
  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly runtimeManager: RuntimeManager,
    private readonly statusUpdater: StatusUpdater,
    private readonly sessionLifecycle: SessionLifecycle,
    private readonly eventProcessor: EventProcessor
  ) {}

  getRuntime(eventId: string): EventRuntime | undefined {
    return this.runtimeManager.getRuntime(eventId);
  }

  async ensureRuntime(eventId: string): Promise<EventRuntime> {
    let runtime = this.runtimeManager.getRuntime(eventId);
    if (runtime) {
      runtime.updatedAt = new Date();
      return runtime;
    }

    const agent = await this.agentsRepository.getAgentForEvent(eventId);
    if (!agent) {
      throw new Error(`No agent found for event ${eventId}`);
    }

    runtime = await this.runtimeManager.createRuntime(eventId, agent.id);
    return runtime;
  }

  async resetRuntime(eventId: string): Promise<void> {
    const runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      return;
    }

    console.log(`[runtime-service] Resetting runtime for event ${eventId}`);

    if (runtime.summaryTimer) {
      clearInterval(runtime.summaryTimer);
      runtime.summaryTimer = undefined;
    }
    if (runtime.statusUpdateTimer) {
      clearInterval(runtime.statusUpdateTimer);
      runtime.statusUpdateTimer = undefined;
    }

    for (const agentType of ['transcript', 'cards', 'facts'] as const) {
      try {
        await this.statusUpdater.recordMetricsOnSessionClose(runtime, agentType);
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      }
    }

    this.eventProcessor.cleanup(eventId, runtime);

    try {
      await this.sessionLifecycle.closeSessions(runtime);
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }

    runtime.transcriptSession = undefined;
    runtime.cardsSession = undefined;
    runtime.factsSession = undefined;
    runtime.transcriptSessionId = undefined;
    runtime.cardsSessionId = undefined;
    runtime.factsSessionId = undefined;
    runtime.transcriptHandlerSession = undefined;
    runtime.cardsHandlerSession = undefined;
    runtime.factsHandlerSession = undefined;
    runtime.status = 'context_complete';
    runtime.enabledAgents = {
      transcript: false,
      cards: false,
      facts: false,
    };

    this.runtimeManager.removeRuntime(eventId);

    console.log(`[runtime-service] Runtime reset complete for event ${eventId}`);
  }
}
