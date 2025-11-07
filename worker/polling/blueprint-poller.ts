import type OpenAI from 'openai';
import type { Poller } from './base-poller';
import { generateContextBlueprint } from '../context/pipeline/blueprint-generator';

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

    // Filter out agents that already have a non-superseded blueprint
    // Only generate blueprints for agents with no blueprints or only superseded/error blueprints
    const agentsNeedingBlueprints = [];
    for (const agent of blueprintAgents) {
      // Check for existing blueprints in active states (generating, ready, approved)
      // These indicate a blueprint is already in progress or waiting for approval
      const { data: existingBlueprints, error: blueprintCheckError } = await this.supabase
        .from('context_blueprints')
        .select('id, status')
        .eq('agent_id', agent.id)
        .in('status', ['generating', 'ready', 'approved']);

      if (blueprintCheckError) {
        this.log('[blueprint] Error checking blueprints for agent', agent.id, ':', blueprintCheckError.message);
        // On error, skip this agent to be safe
        continue;
      }

      // Only process if no active blueprints exist
      if (!existingBlueprints || existingBlueprints.length === 0) {
        agentsNeedingBlueprints.push(agent);
      } else {
        this.log('[blueprint] Agent', agent.id, 'already has', existingBlueprints.length, 'active blueprint(s), skipping');
      }
    }

    if (agentsNeedingBlueprints.length === 0) {
      return;
    }

    for (const agent of agentsNeedingBlueprints) {
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
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      } finally {
        this.processingAgents.delete(agent.id);
      }
    }
  }

  getInterval(): number {
    return 3000;
  }
}
