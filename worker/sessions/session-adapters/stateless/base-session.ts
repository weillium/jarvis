import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { extractErrorMessage } from '../shared/payload-utils';
import type {
  AgentRealtimeSession,
  AgentSessionLifecycleStatus,
  AgentType,
  RealtimeAudioChunk,
  RealtimeMessageContext,
  RealtimeSessionConfig,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
  RealtimeSessionStatus,
} from '../types';

const nowIso = (): string => new Date().toISOString();

interface StatelessSessionOptions {
  agentType: AgentType;
  logLabel?: string;
}

export class StatelessAgentSession implements AgentRealtimeSession {
  protected readonly config: RealtimeSessionConfig;
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

  private readonly agentType: AgentType;
  private readonly logLabel: string;

  private isActive = false;
  private sessionId?: string;
  private connectedAt?: string;

  constructor(_openai: OpenAI, config: RealtimeSessionConfig, options: StatelessSessionOptions) {
    if (config.agentType !== options.agentType) {
      throw new Error(
        `StatelessAgentSession expects agentType '${options.agentType}', received '${config.agentType}'`
      );
    }

    this.agentType = options.agentType;
    this.logLabel = options.logLabel ?? options.agentType;
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
    this.log('log', `Stateless session activated (${this.sessionId})`);

    return this.sessionId;
  }

  async pause(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.onStatusChange?.('paused', this.sessionId);
    await this.updateDatabaseStatus('paused', this.sessionId);
    this.log('log', 'Stateless session paused');
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
    this.log('log', 'Stateless session closed');
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

  async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    void message;
    void context;
    this.log('log', 'Stateless session sendMessage invoked (no realtime transport available)');
    await Promise.resolve();
  }

  async appendAudioChunk(chunk: RealtimeAudioChunk): Promise<void> {
    void chunk;
    this.log('warn', 'appendAudioChunk called on stateless session (no-op)');
    await Promise.resolve();
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

  protected emitEvent<K extends RealtimeSessionEvent>(
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
        this.log('error', `Error in event handler: ${extractErrorMessage(error)}`);
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
      this.log('error', `Database status update failed: ${extractErrorMessage(error)}`);
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

  protected log(
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ): void {
    this.onLog?.(level, `[${this.logLabel}] ${message}`, context);
  }
}

export class FactsStatelessSession extends StatelessAgentSession {
  constructor(openai: OpenAI, config: RealtimeSessionConfig) {
    super(openai, config, { agentType: 'facts', logLabel: 'facts' });
  }
}


