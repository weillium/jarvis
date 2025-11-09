import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { Poller } from './base-poller';
import {
  regenerateResearchStage,
  regenerateGlossaryStage,
  regenerateChunksStage,
} from '../context/pipeline/context-generation-orchestrator';

type LoggerFn = (...args: unknown[]) => void;

interface AgentRow {
  id: string;
  event_id: string;
  stage: string;
}

interface ContextBlueprintRow {
  id: string;
}

export class RegenerationPoller implements Poller {
  private processingAgents: Set<string>;
  private readonly regenerationStatuses = [
    'regenerating_research',
    'regenerating_glossary',
    'regenerating_chunks',
  ];
  private readonly loggedProcessingAgents: Set<string>;
  private readonly missingBlueprintAgents: Set<string>;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly openai: OpenAI,
    private readonly embedModel: string,
    private readonly genModel: string,
    private readonly exaApiKey: string | undefined,
    processingAgents?: Set<string>,
    private readonly log: LoggerFn = console.log
  ) {
    this.processingAgents = processingAgents ?? new Set<string>();
    this.loggedProcessingAgents = new Set<string>();
    this.missingBlueprintAgents = new Set<string>();
  }

  async tick(): Promise<void> {
    const agentsQuery = this.supabase
      .from('agents')
      .select('id,event_id,stage')
      .in('stage', this.regenerationStatuses)
      .limit(20);
    const agentsResponse: PostgrestResponse<AgentRow> = await agentsQuery;

    const { data: regeneratingAgents, error } = agentsResponse;

    if (error) {
      this.log('[regeneration] fetch error:', error.message);
      return;
    }

    if (!regeneratingAgents || regeneratingAgents.length === 0) {
      return;
    }

    for (const agent of regeneratingAgents) {
      if (this.processingAgents.has(agent.id)) {
        if (!this.loggedProcessingAgents.has(agent.id)) {
          this.log('[regeneration] Agent', agent.id, 'already being processed, skipping');
          this.loggedProcessingAgents.add(agent.id);
        }
        continue;
      }

      const blueprintQuery = this.supabase
        .from('context_blueprints')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      const blueprintResponse: PostgrestSingleResponse<ContextBlueprintRow> = await blueprintQuery;
      const { data: blueprint, error: blueprintError } = blueprintResponse;

      if (blueprintError || !blueprint) {
        if (!this.missingBlueprintAgents.has(agent.id)) {
          this.log('[regeneration] No approved blueprint found for agent', agent.id);
          this.missingBlueprintAgents.add(agent.id);
        }
        continue;
      }

      this.missingBlueprintAgents.delete(agent.id);
      this.processingAgents.add(agent.id);
      this.loggedProcessingAgents.delete(agent.id);

      try {
        const options = {
          supabase: this.supabase,
          openai: this.openai,
          embedModel: this.embedModel,
          genModel: this.genModel,
          exaApiKey: this.exaApiKey,
        };

        if (agent.stage === 'regenerating_research') {
          this.log('[regeneration] regenerating research for agent', agent.id);
          await regenerateResearchStage(agent.event_id, agent.id, blueprint.id, options);
        } else if (agent.stage === 'regenerating_glossary') {
          this.log('[regeneration] regenerating glossary for agent', agent.id);
          await regenerateGlossaryStage(agent.event_id, agent.id, blueprint.id, options);
        } else if (agent.stage === 'regenerating_chunks') {
          this.log('[regeneration] regenerating chunks for agent', agent.id);
          await regenerateChunksStage(agent.event_id, agent.id, blueprint.id, options);
        }

        this.log('[regeneration] regeneration complete for agent', agent.id);
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      } finally {
        this.processingAgents.delete(agent.id);
        this.loggedProcessingAgents.delete(agent.id);
        this.missingBlueprintAgents.delete(agent.id);
      }
    }
  }

  getInterval(): number {
    return 3000;
  }
}
