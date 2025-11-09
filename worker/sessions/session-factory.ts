import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type {
  AgentRealtimeSession,
  AgentSessionLifecycleStatus,
  AgentType,
  RealtimeSessionConfig,
} from './session-adapters';
import { defaultAgentProfiles } from './agent-profiles';
import type { AgentProfileRegistry } from './agent-profiles';
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
    const config = this.buildConfig('transcript', runtime, hooks, model);
    const openaiClient = apiKey ? new OpenAI({ apiKey }) : this.openai;
    return this.createSessionFromProfile('transcript', openaiClient, config);
  }

  createCardsSession(
    runtime: EventRuntime,
    hooks: SessionHooks,
    model: string,
    apiKey?: string
  ): AgentRealtimeSession {
    const config = this.buildConfig('cards', runtime, hooks, model);
    const openaiClient = apiKey ? new OpenAI({ apiKey }) : this.openai;
    return this.createSessionFromProfile('cards', openaiClient, config);
  }

  createFactsSession(
    runtime: EventRuntime,
    hooks: SessionHooks,
    model: string,
    apiKey?: string
  ): AgentRealtimeSession {
    const config = this.buildConfig('facts', runtime, hooks, model);
    const openaiClient = apiKey ? new OpenAI({ apiKey }) : this.openai;
    return this.createSessionFromProfile('facts', openaiClient, config);
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
    config: RealtimeSessionConfig
  ): AgentRealtimeSession {
    const profile = this.agentProfiles[agentType];
    if (!profile) {
      throw new Error(`No agent profile registered for agent type '${agentType}'`);
    }
    return profile.createSession(openaiClient, config, {
      openaiService: this.openaiService,
    });
  }
}
