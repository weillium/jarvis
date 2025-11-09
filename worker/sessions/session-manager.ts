import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentType, EventRuntime } from '../types';
import type {
  AgentRealtimeSession,
  AgentSessionLifecycleStatus,
  RealtimeAudioChunk,
} from './realtime-session';
import type { SessionFactory } from './session-factory';
import type { Logger } from '../monitoring/logger';

export type TranscriptAudioOptions = RealtimeAudioChunk;

type SessionStatusHandler = (
  agentType: AgentType,
  status: AgentSessionLifecycleStatus,
  sessionId?: string
) => Promise<void>;

type RetrieveHandler = (
  query: string,
  topK: number
) => Promise<Array<{ id: string; chunk: string; similarity: number }>>;

type EmbedHandler = (text: string) => Promise<number[]>;

type LogHandler = (
  level: 'log' | 'warn' | 'error',
  message: string,
  context?: { seq?: number }
) => void;

export interface AgentSessionOptions {
  onRetrieve?: RetrieveHandler;
  embedText?: EmbedHandler;
  onLog?: LogHandler;
}

export interface SessionCreationOptions {
  transcript?: AgentSessionOptions;
  cards?: AgentSessionOptions;
  facts?: AgentSessionOptions;
}

export class SessionManager {
  constructor(
    private readonly sessionFactory: SessionFactory,
    private readonly supabaseClient: SupabaseClient,
    private readonly logger: Logger
  ) {}

  createTranscriptSession(
    runtime: EventRuntime,
    onStatusChange: SessionStatusHandler,
    transcriptModel: string,
    options: AgentSessionOptions = {},
    apiKey?: string
  ): AgentRealtimeSession {
    return this.sessionFactory.createTranscriptSession(
      runtime,
      {
        supabaseClient: this.supabaseClient,
        onStatusChange: (status, sessionId) => onStatusChange('transcript', status, sessionId),
        onLog:
          options.onLog ??
          ((level, message, context) => {
            this.logger.log(runtime.eventId, 'transcript', level, message, context);
          }),
        onRetrieve: options.onRetrieve,
        embedText: options.embedText,
      },
      transcriptModel,
      apiKey
    );
  }

  createCardsSession(
    runtime: EventRuntime,
    onStatusChange: SessionStatusHandler,
    cardsModel: string,
    options: AgentSessionOptions = {},
    apiKey?: string
  ): AgentRealtimeSession {
    return this.sessionFactory.createCardsSession(
      runtime,
      {
        supabaseClient: this.supabaseClient,
        onStatusChange: (status, sessionId) => onStatusChange('cards', status, sessionId),
        onLog:
          options.onLog ??
          ((level, message, context) => {
            this.logger.log(runtime.eventId, 'cards', level, message, context);
          }),
        onRetrieve: options.onRetrieve,
        embedText: options.embedText,
      },
      cardsModel,
      apiKey
    );
  }

  createFactsSession(
    runtime: EventRuntime,
    onStatusChange: SessionStatusHandler,
    factsModel: string,
    options: AgentSessionOptions = {},
    apiKey?: string
  ): AgentRealtimeSession {
    return this.sessionFactory.createFactsSession(
      runtime,
      {
        supabaseClient: this.supabaseClient,
        onStatusChange: (status, sessionId) => onStatusChange('facts', status, sessionId),
        onLog:
          options.onLog ??
          ((level, message, context) => {
            this.logger.log(runtime.eventId, 'facts', level, message, context);
          }),
        onRetrieve: options.onRetrieve,
        embedText: options.embedText,
      },
      factsModel,
      apiKey
    );
  }

  async appendAudioToTranscriptSession(
    session: AgentRealtimeSession,
    chunk: TranscriptAudioOptions
  ): Promise<void> {
    await session.appendAudioChunk(chunk);
  }

  createSessions(
    runtime: EventRuntime,
    onStatusChange: SessionStatusHandler,
    transcriptModel: string,
    cardsModel: string,
    factsModel: string,
    options: SessionCreationOptions = {},
    apiKey?: string
  ): {
    transcriptSession: AgentRealtimeSession;
    cardsSession: AgentRealtimeSession;
    factsSession: AgentRealtimeSession;
  } {
    const transcriptSession = this.sessionFactory.createTranscriptSession(runtime, {
      supabaseClient: this.supabaseClient,
      onStatusChange: (status, sessionId) => onStatusChange('transcript', status, sessionId),
      onLog:
        options.transcript?.onLog ??
        ((level, message, context) => {
          this.logger.log(runtime.eventId, 'transcript', level, message, context);
        }),
      onRetrieve: options.transcript?.onRetrieve,
      embedText: options.transcript?.embedText,
    }, transcriptModel, apiKey);

    const cardsSession = this.sessionFactory.createCardsSession(runtime, {
      supabaseClient: this.supabaseClient,
      onStatusChange: (status, sessionId) => onStatusChange('cards', status, sessionId),
      onLog:
        options.cards?.onLog ??
        ((level, message, context) => {
          this.logger.log(runtime.eventId, 'cards', level, message, context);
        }),
      onRetrieve: options.cards?.onRetrieve,
      embedText: options.cards?.embedText,
    }, cardsModel, apiKey);

    const factsSession = this.sessionFactory.createFactsSession(runtime, {
      supabaseClient: this.supabaseClient,
      onStatusChange: (status, sessionId) => onStatusChange('facts', status, sessionId),
      onLog:
        options.facts?.onLog ??
        ((level, message, context) => {
          this.logger.log(runtime.eventId, 'facts', level, message, context);
        }),
      onRetrieve: options.facts?.onRetrieve,
      embedText: options.facts?.embedText,
    }, factsModel, apiKey);

    return { transcriptSession, cardsSession, factsSession };
  }

  async connectSessions(sessions: {
    transcript?: AgentRealtimeSession;
    cards?: AgentRealtimeSession;
    facts?: AgentRealtimeSession;
  }): Promise<{ transcriptSessionId?: string; cardsSessionId?: string; factsSessionId?: string }> {
    const results: { transcriptSessionId?: string; cardsSessionId?: string; factsSessionId?: string } =
      {};

    if (sessions.transcript) {
      results.transcriptSessionId = await sessions.transcript.connect();
    }
    if (sessions.cards) {
      results.cardsSessionId = await sessions.cards.connect();
    }
    if (sessions.facts) {
      results.factsSessionId = await sessions.facts.connect();
    }

    return results;
  }

  async pauseSessions(
    transcriptSession?: AgentRealtimeSession,
    cardsSession?: AgentRealtimeSession,
    factsSession?: AgentRealtimeSession
  ): Promise<void> {
    if (transcriptSession) {
      await transcriptSession.pause();
    }
    if (cardsSession) {
      await cardsSession.pause();
    }
    if (factsSession) {
      await factsSession.pause();
    }
  }

  async resumeSessions(
    transcriptSession?: AgentRealtimeSession,
    cardsSession?: AgentRealtimeSession,
    factsSession?: AgentRealtimeSession
  ): Promise<{ transcriptSessionId?: string; cardsSessionId?: string; factsSessionId?: string }> {
    const transcriptSessionId = transcriptSession ? await transcriptSession.resume() : undefined;
    const cardsSessionId = cardsSession ? await cardsSession.resume() : undefined;
    const factsSessionId = factsSession ? await factsSession.resume() : undefined;
    return { transcriptSessionId, cardsSessionId, factsSessionId };
  }

  async closeSessions(
    transcriptSession?: AgentRealtimeSession,
    cardsSession?: AgentRealtimeSession,
    factsSession?: AgentRealtimeSession
  ): Promise<void> {
    if (transcriptSession) {
      await transcriptSession.close();
    }
    if (cardsSession) {
      await cardsSession.close();
    }
    if (factsSession) {
      await factsSession.close();
    }
  }
}
