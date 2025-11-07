import type OpenAI from 'openai';
import type { Poller } from './base-poller';
import { executeContextGeneration } from '../context/pipeline/context-generation-orchestrator';

type LoggerFn = (...args: any[]) => void;

export class ContextPoller implements Poller {
  private processingAgents: Set<string>;

  constructor(
    private readonly supabase: any,
    private readonly openai: OpenAI,
    private readonly embedModel: string,
    private readonly genModel: string,
    private readonly exaApiKey: string | undefined,
    processingAgents?: Set<string>,
    private readonly log: LoggerFn = console.log
  ) {
    this.processingAgents = processingAgents ?? new Set<string>();
  }

  async tick(): Promise<void> {
    const { data: approvedAgents, error } = await this.supabase
      .from('agents')
      .select('id,event_id,status,stage')
      .eq('status', 'idle')
      .eq('stage', 'blueprint')
      .limit(20);

    if (error) {
      this.log('[context-gen] fetch error:', error.message);
      return;
    }

    if (!approvedAgents || approvedAgents.length === 0) {
      return;
    }

    for (const agent of approvedAgents) {
      if (this.processingAgents.has(agent.id)) {
        this.log('[context-gen] Agent', agent.id, 'already being processed, skipping');
        continue;
      }

      const { data: blueprint, error: blueprintError } = (await (this.supabase
        .from('context_blueprints')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('status', 'approved')
        .limit(1)
        .single())) as { data: { id: string } | null; error: any };

      if (blueprintError || !blueprint) {
        this.log('[context-gen] No approved blueprint found for agent', agent.id);
        continue;
      }

      this.processingAgents.add(agent.id);

      try {
        this.log(
          '[context-gen] executing context generation for agent',
          agent.id,
          'event',
          agent.event_id,
          'blueprint',
          blueprint.id
        );
        await executeContextGeneration(agent.event_id, agent.id, blueprint.id, {
          supabase: this.supabase,
          openai: this.openai,
          embedModel: this.embedModel,
          genModel: this.genModel,
          exaApiKey: this.exaApiKey,
        });
        this.log('[context-gen] context generation complete for agent', agent.id);
      } catch (err: any) {
        this.log('[context-gen] error', err?.message || err);
        await this.supabase.from('agents').update({ status: 'error' }).eq('id', agent.id);
      } finally {
        this.processingAgents.delete(agent.id);
      }
    }
  }

  getInterval(): number {
    return 3000;
  }
}
