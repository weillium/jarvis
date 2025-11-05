import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { RealtimeSession, RealtimeSessionConfig } from './realtime-session';
import type { EventRuntime } from '../types';
import { VectorSearchService } from '../context/vector-search';
import { OpenAIService } from '../services/openai-service';

type SessionStatus = 'starting' | 'active' | 'paused' | 'closed' | 'error';
type StatusHandler = (status: SessionStatus, sessionId?: string) => Promise<void>;
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
  constructor(
    private readonly openai: OpenAI,
    private readonly openaiService: OpenAIService,
    private readonly vectorSearch: VectorSearchService,
    private readonly defaultRealtimeModel: string
  ) {}

  createCardsSession(runtime: EventRuntime, hooks: SessionHooks): RealtimeSession {
    const config = this.buildConfig('cards', runtime, hooks);
    return new RealtimeSession(this.openai, config);
  }

  createFactsSession(runtime: EventRuntime, hooks: SessionHooks): RealtimeSession {
    const config = this.buildConfig('facts', runtime, hooks);
    return new RealtimeSession(this.openai, config);
  }

  private buildConfig(
    agentType: 'cards' | 'facts',
    runtime: EventRuntime,
    hooks: SessionHooks
  ): RealtimeSessionConfig {
    const model = this.openaiService.getRealtimeModel(this.defaultRealtimeModel);

    return {
      eventId: runtime.eventId,
      agentType,
      model,
      onStatusChange: hooks.onStatusChange,
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
}
