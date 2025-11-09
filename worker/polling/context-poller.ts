import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type OpenAI from 'openai';
import type { Poller } from './base-poller';
import { executeContextGeneration } from '../context/pipeline/context-generation-orchestrator';

type LoggerFn = (...args: unknown[]) => void;

interface AgentRecord {
  id: string;
  event_id: string;
  status?: string;
  stage?: string;
}

interface ContextBlueprintRecord {
  id: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAgentRecord = (value: unknown): value is AgentRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.event_id === 'string' &&
  (value.status === undefined || typeof value.status === 'string') &&
  (value.stage === undefined || typeof value.stage === 'string');

const isAgentArray = (value: unknown): value is AgentRecord[] =>
  Array.isArray(value) && value.every(isAgentRecord);

const isContextBlueprintRecord = (value: unknown): value is ContextBlueprintRecord =>
  isRecord(value) && typeof value.id === 'string';

export class ContextPoller implements Poller {
  private processingAgents: Set<string>;
  private readonly loggedProcessingAgents: Set<string>;
  private readonly missingBlueprintAgents: Set<string>;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly openai: OpenAI,
    private readonly embedModel: string,
    private readonly genModel: string,
    private readonly chunksPolishModel: string,
    private readonly glossaryModel: string,
    private readonly exaApiKey: string | undefined,
    processingAgents?: Set<string>,
    private readonly log: LoggerFn = console.log
  ) {
    this.processingAgents = processingAgents ?? new Set<string>();
    this.loggedProcessingAgents = new Set<string>();
    this.missingBlueprintAgents = new Set<string>();
  }

  async tick(): Promise<void> {
    const agentsResult: PostgrestResponse<AgentRecord> = await this.supabase
      .from('agents')
      .select('id,event_id,status,stage')
      .eq('status', 'idle')
      .eq('stage', 'blueprint')
      .limit(20);

    const { data: approvedAgents, error } = agentsResult;

    if (error) {
      this.log('[context-gen] fetch error:', error.message ?? 'Unknown error');
      return;
    }

    if (!approvedAgents || approvedAgents.length === 0) {
      return;
    }

    if (!isAgentArray(approvedAgents)) {
      console.error("[context-poller] error:", 'Invalid agent payload received');
      return;
    }

    for (const agent of approvedAgents) {
      if (this.processingAgents.has(agent.id)) {
        if (!this.loggedProcessingAgents.has(agent.id)) {
          this.log('[context-gen] Agent', agent.id, 'already being processed, skipping');
          this.loggedProcessingAgents.add(agent.id);
        }
        continue;
      }

      const blueprintResult: PostgrestSingleResponse<ContextBlueprintRecord> = await this.supabase
        .from('context_blueprints')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('status', 'approved')
        .limit(1)
        .single();

      const { data: blueprint, error: blueprintError } = blueprintResult;

      if (blueprintError || !blueprint || !isContextBlueprintRecord(blueprint)) {
        if (!this.missingBlueprintAgents.has(agent.id)) {
          this.log('[context-gen] No approved blueprint found for agent', agent.id);
          this.missingBlueprintAgents.add(agent.id);
        }
        continue;
      }

      this.missingBlueprintAgents.delete(agent.id);
      this.processingAgents.add(agent.id);
      this.loggedProcessingAgents.delete(agent.id);

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
          chunkPolishModel: this.chunksPolishModel,
          glossaryModel: this.glossaryModel,
          exaApiKey: this.exaApiKey,
        });
        this.log('[context-gen] context generation complete for agent', agent.id);
      } catch (err: unknown) {
        console.error("[context-poller] error:", String(err));
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
