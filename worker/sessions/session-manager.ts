import type { AgentType, EventRuntime } from '../types';
import { RealtimeSession } from './realtime-session';
import { SessionFactory } from './session-factory';
import { SupabaseService } from '../services/supabase-service';
import { Logger } from '../monitoring/logger';

type SessionStatus = 'starting' | 'active' | 'paused' | 'closed' | 'error';

type SessionStatusHandler = (
  agentType: AgentType,
  status: SessionStatus,
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

interface AgentSessionOptions {
  onRetrieve?: RetrieveHandler;
  embedText?: EmbedHandler;
  onLog?: LogHandler;
}

interface SessionCreationOptions {
  cards?: AgentSessionOptions;
  facts?: AgentSessionOptions;
}

export class SessionManager {
  constructor(
    private readonly sessionFactory: SessionFactory,
    private readonly supabase: SupabaseService,
    private readonly logger: Logger
  ) {}

  async createSessions(
    runtime: EventRuntime,
    onStatusChange: SessionStatusHandler,
    options: SessionCreationOptions = {}
  ): Promise<{ cardsSession: RealtimeSession; factsSession: RealtimeSession }> {
    const supabaseClient = this.supabase.getClient();

    const cardsSession = this.sessionFactory.createCardsSession(runtime, {
      supabaseClient,
      onStatusChange: (status, sessionId) => onStatusChange('cards', status, sessionId),
      onLog:
        options.cards?.onLog ??
        ((level, message, context) => {
          this.logger.log(runtime.eventId, 'cards', level, message, context);
        }),
      onRetrieve: options.cards?.onRetrieve,
      embedText: options.cards?.embedText,
    });

    const factsSession = this.sessionFactory.createFactsSession(runtime, {
      supabaseClient,
      onStatusChange: (status, sessionId) => onStatusChange('facts', status, sessionId),
      onLog:
        options.facts?.onLog ??
        ((level, message, context) => {
          this.logger.log(runtime.eventId, 'facts', level, message, context);
        }),
      onRetrieve: options.facts?.onRetrieve,
      embedText: options.facts?.embedText,
    });

    return { cardsSession, factsSession };
  }

  async connectSessions(
    cardsSession: RealtimeSession,
    factsSession: RealtimeSession
  ): Promise<{ cardsSessionId: string; factsSessionId: string }> {
    const cardsSessionId = await cardsSession.connect();
    const factsSessionId = await factsSession.connect();
    return { cardsSessionId, factsSessionId };
  }

  async pauseSessions(cardsSession?: RealtimeSession, factsSession?: RealtimeSession): Promise<void> {
    if (cardsSession) {
      await cardsSession.pause();
    }
    if (factsSession) {
      await factsSession.pause();
    }
  }

  async resumeSessions(
    cardsSession?: RealtimeSession,
    factsSession?: RealtimeSession
  ): Promise<{ cardsSessionId?: string; factsSessionId?: string }> {
    const cardsSessionId = cardsSession ? await cardsSession.resume() : undefined;
    const factsSessionId = factsSession ? await factsSession.resume() : undefined;
    return { cardsSessionId, factsSessionId };
  }

  async closeSessions(cardsSession?: RealtimeSession, factsSession?: RealtimeSession): Promise<void> {
    if (cardsSession) {
      await cardsSession.close();
    }
    if (factsSession) {
      await factsSession.close();
    }
  }
}
