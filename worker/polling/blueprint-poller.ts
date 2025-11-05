import OpenAI from 'openai';
import { Poller } from './base-poller';
import { generateContextBlueprint } from '../blueprint-generator';

type LoggerFn = (...args: any[]) => void;

export class BlueprintPoller implements Poller {
  private processingAgents: Set<string>;

  constructor(
    private readonly supabase: any,
    private readonly openai: OpenAI,
    private readonly genModel: string,
    processingAgents?: Set<string>,
    private readonly log: LoggerFn = console.log
  ) {
    this.processingAgents = processingAgents ?? new Set<string>();
  }

  async tick(): Promise<void> {
    const { data: blueprintAgents, error } = await this.supabase
      .from('agents')
      .select('id,event_id,status,stage')
      .eq('status', 'idle')
      .eq('stage', 'blueprint')
      .limit(20);

    if (error) {
      this.log('[blueprint] fetch error:', error.message);
      return;
    }

    if (!blueprintAgents || blueprintAgents.length === 0) {
      return;
    }

    for (const agent of blueprintAgents) {
      if (this.processingAgents.has(agent.id)) {
        this.log('[blueprint] Agent', agent.id, 'already being processed, skipping');
        continue;
      }

      this.processingAgents.add(agent.id);

      try {
        this.log('[blueprint] generating blueprint for agent', agent.id, 'event', agent.event_id);
        const blueprintId = await generateContextBlueprint(agent.event_id, agent.id, {
          supabase: this.supabase,
          openai: this.openai,
          genModel: this.genModel,
        });
        this.log('[blueprint] blueprint generated successfully', blueprintId, 'for agent', agent.id);
      } catch (err: any) {
        this.log('[blueprint] error', err?.message || err);
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
