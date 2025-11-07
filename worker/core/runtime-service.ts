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
    if (runtime.factsUpdateTimer) {
      clearTimeout(runtime.factsUpdateTimer);
      runtime.factsUpdateTimer = undefined;
    }

    for (const agentType of ['transcript', 'cards', 'facts'] as const) {
      try {
        await this.statusUpdater.recordMetricsOnSessionClose(runtime, agentType);
      } catch (error: any) {
        console.warn(
          `[runtime-service] Failed to record ${agentType} metrics on reset: ${error?.message || error}`
        );
      }
    }

    this.eventProcessor.cleanup(eventId, runtime);

    try {
      await this.sessionLifecycle.closeSessions(runtime);
    } catch (error: any) {
      console.error(
        `[runtime-service] Error closing sessions during reset: ${error?.message || error}`
      );
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

    this.runtimeManager.removeRuntime(eventId);

    console.log(`[runtime-service] Runtime reset complete for event ${eventId}`);
  }
}
