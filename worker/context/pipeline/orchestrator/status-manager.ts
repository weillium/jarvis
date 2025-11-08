import type { GenerationContext } from './phase-context';
import {
  createGenerationCycle,
  markGenerationCyclesSuperseded,
  updateAgentStatus,
  updateGenerationCycle,
  type GenerationCycleType,
  type WorkerSupabaseClient,
} from './supabase-orchestrator';

export class StatusManager {
  constructor(private readonly supabase: WorkerSupabaseClient) {}

  async markAgentStatus(agentId: string, stage: string): Promise<void> {
    await updateAgentStatus(this.supabase, agentId, stage);
  }

  async createCycle(
    context: GenerationContext,
    cycleType: GenerationCycleType,
    component?: string
  ): Promise<string> {
    return createGenerationCycle(
      this.supabase,
      context.eventId,
      context.agentId,
      context.blueprintId,
      cycleType,
      component
    );
  }

  async updateCycle(
    cycleId: string,
    updates: Parameters<typeof updateGenerationCycle>[2]
  ): Promise<void> {
    await updateGenerationCycle(this.supabase, cycleId, updates);
  }

  async supersedeCycles(
    context: GenerationContext,
    cycleTypes: GenerationCycleType[],
    logContext: string,
    excludeCycleId?: string
  ): Promise<void> {
    await markGenerationCyclesSuperseded(this.supabase, {
      eventId: context.eventId,
      cycleTypes,
      logContext,
      excludeCycleId,
    });
  }
}

