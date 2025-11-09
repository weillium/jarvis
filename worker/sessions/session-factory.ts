import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type {
  AgentRealtimeSession,
  AgentSessionLifecycleStatus,
  AgentType,
  RealtimeSessionConfig,
} from './session-adapters';
import { defaultAgentProfiles, type AgentProfileRegistry, type AgentProfileTransport } from './agent-profiles';
import { agentTransportProfiles } from './agent-profiles/registry';
import type { EventRuntime } from '../types';
import type { VectorSearchService } from '../context/vector-search';
import type { OpenAIService } from '../services/openai-service';

type StatusHandler = (status: AgentSessionLifecycleStatus, sessionId?: string) => Promise<void>;
type LogHandler = (
  level: 'log' | 'warn' | 'error',
  message: string,
  context?: { seq?: number }
) => void;
type RetrieveHandler = (
  query: string,
  topK: number
) => Promise<Array<{ id: string; chunk: string; similarity: number }>>;
type EmbedHandler = (text: string) => Promise<number[]>;

interface SessionHooks {
  onStatusChange: StatusHandler;
  onLog: LogHandler;
  supabaseClient?: SupabaseClient;
  onRetrieve?: RetrieveHandler;
  embedText?: EmbedHandler;
}

export class SessionFactory {
  private readonly agentProfiles: AgentProfileRegistry;

  constructor(
    private readonly openai: OpenAI,
    private readonly openaiService: OpenAIService,
    private readonly vectorSearch: VectorSearchService,
    private readonly defaultCardsModel: string,
    agentProfiles: AgentProfileRegistry = defaultAgentProfiles
  ) {
    this.agentProfiles = agentProfiles;
  }

  createTranscriptSession(
    runtime: EventRuntime,
    hooks: SessionHooks,
    model: string,
    apiKey?: string
  ): AgentRealtimeSession {
    const transport = this.resolveTransport('transcript');
    const resolvedModel = this.resolveModel('transcript', transport, model);
    const config = this.buildConfig('transcript', runtime, hooks, resolvedModel);
    const openaiClient = apiKey ? new OpenAI({ apiKey }) : this.openai;
    return this.createSessionFromProfile('transcript', openaiClient, config, transport);
  }

  createCardsSession(
    runtime: EventRuntime,
    hooks: SessionHooks,
    model: string,
    apiKey?: string
  ): AgentRealtimeSession {
    const transport = this.resolveTransport('cards');
    const resolvedModel = this.resolveModel('cards', transport, model);
    const config = this.buildConfig('cards', runtime, hooks, resolvedModel);
    const openaiClient = apiKey ? new OpenAI({ apiKey }) : this.openai;
    return this.createSessionFromProfile('cards', openaiClient, config, transport);
  }

  createFactsSession(
    runtime: EventRuntime,
    hooks: SessionHooks,
    model: string,
    apiKey?: string
  ): AgentRealtimeSession {
    const transport = this.resolveTransport('facts');
    const resolvedModel = this.resolveModel('facts', transport, model);
    const config = this.buildConfig('facts', runtime, hooks, resolvedModel);
    const openaiClient = apiKey ? new OpenAI({ apiKey }) : this.openai;
    return this.createSessionFromProfile('facts', openaiClient, config, transport);
  }

  private buildConfig(
    agentType: AgentType,
    runtime: EventRuntime,
    hooks: SessionHooks,
    model: string
  ): RealtimeSessionConfig {

    return {
      eventId: runtime.eventId,
      agentType,
      model,
      onStatusChange: (status, sessionId) => {
        void hooks.onStatusChange(status, sessionId).catch((err: unknown) => {
          console.error(
            `[session-factory] onStatusChange handler failed: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      },
      onLog: hooks.onLog,
      supabase: hooks.supabaseClient,
      onRetrieve:
        hooks.onRetrieve ??
        (async (query: string, topK: number) => {
          return await this.vectorSearch.search(runtime.eventId, query, topK);
        }),
      embedText:
        hooks.embedText ??
        (async (text: string) => {
          return await this.openaiService.createEmbedding(text);
        }),
    };
  }

  private createSessionFromProfile(
    agentType: AgentType,
    openaiClient: OpenAI,
    config: RealtimeSessionConfig,
    transportOverride?: AgentProfileTransport
  ): AgentRealtimeSession {
    const profile = this.agentProfiles[agentType];
    if (!profile) {
      throw new Error(`No agent profile registered for agent type '${agentType}'`);
    }
    return profile.createSession(openaiClient, config, {
      openaiService: this.openaiService,
    }, transportOverride);
  }

  private resolveTransport(agentType: AgentType): AgentProfileTransport {
    const profile = this.agentProfiles[agentType];
    if (!profile) {
      throw new Error(`No agent profile registered for agent type '${agentType}'`);
    }
    return profile.defaultTransport;
  }

  private resolveModel(
    agentType: AgentType,
    transport: AgentProfileTransport,
    modelHint?: string
  ): string {
    const transportProfiles = agentTransportProfiles[agentType];
    if (!transportProfiles) {
      throw new Error(`No transport profiles registered for agent type '${agentType}'`);
    }

    const profile =
      transport === 'realtime'
        ? transportProfiles.transports.realtime
        : transportProfiles.transports.stateless;

    if (!profile) {
      throw new Error(`Transport '${transport}' not supported for agent '${agentType}'`);
    }

    const resolver = (profile as { resolveModel?: (hint?: string) => string }).resolveModel;
    const defaultModel = (profile as { defaultModel?: string }).defaultModel;

    const resolved = resolver ? resolver(modelHint) : modelHint ?? defaultModel;
    if (!resolved) {
      throw new Error(`Model required for ${agentType} (${transport})`);
    }
    return resolved;
  }
}
