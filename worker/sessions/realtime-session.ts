import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { extractErrorMessage } from './realtime-session/payload-utils';
import type {
  AgentRealtimeSession,
  AgentSessionLifecycleStatus,
  RealtimeAudioChunk,
  RealtimeMessageContext,
  RealtimeSessionConfig,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
  RealtimeSessionStatus,
} from './realtime-session/types';

export type {
  AgentSessionLifecycleStatus,
  AgentRealtimeSession,
  AgentType,
  RealtimeAudioChunk,
  RealtimeSessionConfig,
} from './realtime-session/types';

const nowIso = (): string => new Date().toISOString();

/**
 * FactsStatelessSession
 * Lightweight AgentRealtimeSession implementation for the facts agent.
 * Manages status transitions without establishing realtime WebSocket connections.
 */
export class FactsStatelessSession implements AgentRealtimeSession {
  private readonly config: RealtimeSessionConfig;
  private readonly supabase?: SupabaseClient;
  private readonly onStatusChange?: (
    status: AgentSessionLifecycleStatus,
    sessionId?: string
  ) => void;
  private readonly onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ) => void;
  private readonly eventHandlers: {
    [K in RealtimeSessionEvent]?: Array<(payload: RealtimeSessionEventPayloads[K]) => void>;
  } = {};

  private isActive = false;
  private sessionId?: string;
  private connectedAt?: string;

  constructor(_openai: OpenAI, config: RealtimeSessionConfig) {
    if (config.agentType !== 'facts') {
      throw new Error(
        `FactsStatelessSession expects agentType 'facts', received '${config.agentType}'`
      );
    }

    this.config = config;
    this.supabase = config.supabase;
    this.onStatusChange = config.onStatusChange;
    this.onLog = config.onLog;
  }

  async connect(): Promise<string> {
    if (!this.sessionId) {
      this.sessionId = this.generateSessionId();
    }

    this.isActive = true;
    this.connectedAt = nowIso();

    this.onStatusChange?.('active', this.sessionId);
    await this.updateDatabaseStatus('active', this.sessionId);
    this.onLog?.('log', `[facts] Stateless session activated (${this.sessionId})`);

    return this.sessionId;
  }

  async pause(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.onStatusChange?.('paused', this.sessionId);
    await this.updateDatabaseStatus('paused', this.sessionId);
    this.onLog?.('log', '[facts] Stateless session paused');
  }

  async resume(): Promise<string> {
    return await this.connect();
  }

  async close(): Promise<void> {
    if (!this.isActive && !this.sessionId) {
      return;
    }

    this.isActive = false;
    this.onStatusChange?.('closed', this.sessionId);
    await this.updateDatabaseStatus('closed', this.sessionId);
    this.onLog?.('log', '[facts] Stateless session closed');
    this.sessionId = undefined;
    this.connectedAt = undefined;
  }

  getStatus(): RealtimeSessionStatus {
    return {
      isActive: this.isActive,
      queueLength: 0,
      websocketState: this.isActive ? 'OPEN' : 'CLOSED',
      connectionUrl: undefined,
      sessionId: this.sessionId,
      connectedAt: this.connectedAt,
    };
  }

  notifyStatus(status: AgentSessionLifecycleStatus, sessionId?: string): void {
    this.onStatusChange?.(status, sessionId ?? this.sessionId);
  }

  async sendMessage(_message: string, _context?: RealtimeMessageContext): Promise<void> {
    this.onLog?.(
      'log',
      '[facts] Stateless session sendMessage invoked (no realtime transport available)'
    );
  }

  async appendAudioChunk(_chunk: RealtimeAudioChunk): Promise<void> {
    this.onLog?.('warn', '[facts] appendAudioChunk called on stateless session (no-op)');
  }

  on<K extends RealtimeSessionEvent>(
    event: K,
    handler: (payload: RealtimeSessionEventPayloads[K]) => void
  ): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event]!.push(handler);
  }

  private emitEvent<K extends RealtimeSessionEvent>(
    event: K,
    payload: RealtimeSessionEventPayloads[K]
  ): void {
    const handlers = this.eventHandlers[event];
    if (!handlers) {
      return;
    }
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error: unknown) {
        this.onLog?.('error', `[facts] Error in event handler: ${extractErrorMessage(error)}`);
      }
    });
  }

  private async updateDatabaseStatus(
    status: AgentSessionLifecycleStatus,
    sessionId?: string
  ): Promise<void> {
    if (!this.supabase || !this.config.eventId) {
      return;
    }

    const updateData: Record<string, string> = {
      status,
      updated_at: nowIso(),
    };

    if (sessionId) {
      updateData.provider_session_id = sessionId;
    }

    if (status === 'active' && this.config.model) {
      updateData.model = this.config.model;
    }

    if (status === 'closed') {
      updateData.closed_at = nowIso();
    }

    try {
      await this.supabase
        .from('agent_sessions')
        .update(updateData)
        .match({
          event_id: this.config.eventId,
          agent_type: this.config.agentType,
        });
    } catch (error: unknown) {
      this.onLog?.('error', `[facts] Database status update failed: ${extractErrorMessage(error)}`);
    }
  }

  private generateSessionId(): string {
    const base = `${this.config.eventId}-${this.config.agentType}`;
    try {
      return `${base}-${randomUUID()}`;
    } catch {
      return `${base}-${Date.now()}`;
    }
  }
}

