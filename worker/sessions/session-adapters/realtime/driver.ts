import type OpenAI from 'openai';
import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type {
  RealtimeClientEvent,
  RealtimeServerEvent,
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractErrorField,
  extractErrorMessage,
  getLowercaseErrorField,
} from '../shared/payload-utils';
import type {
  AgentRealtimeSession,
  AgentSessionLifecycleStatus,
  RealtimeAudioChunk,
  RealtimeMessageContext,
  RealtimeSessionConfig,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
  RealtimeSessionStatus,
} from '../types';
import { MessageQueueManager } from '../shared/message-queue';
import { buildStatusSnapshot } from '../shared/status-tracker';
import { getUnderlyingSocket } from './transport-utils';
import { HeartbeatManager } from './heartbeat-manager';
import type { AgentHandler } from '../types';
import { EventRouter } from './event-router';
import { RuntimeController } from './runtime-controller';
import { ConnectionManager } from './connection-manager';
import type { RealtimeSessionProfile, SessionConfiguration } from './profile-types';
import { classifyRealtimeError } from './utils';

type LogContext = Record<string, unknown> & { seq?: number };

export class RealtimeAgentSession implements AgentRealtimeSession {
  private readonly openai: OpenAI;
  private session?: OpenAIRealtimeWebSocket;
  private readonly config: RealtimeSessionConfig;
  private readonly profile: RealtimeSessionProfile;
  private isActive = false;
  private readonly messageQueue: MessageQueueManager;
  private readonly heartbeat: HeartbeatManager;
  private readonly agentHandler: AgentHandler;
  private readonly runtimeController: RuntimeController;
  private readonly eventRouter: EventRouter;
  private readonly connectionManager: ConnectionManager;
  private readonly eventHandlers: {
    [K in RealtimeSessionEvent]?: Array<(data: RealtimeSessionEventPayloads[K]) => void>;
  } = {};
  private readonly onStatusChange?: (
    status: AgentSessionLifecycleStatus,
    sessionId?: string
  ) => void;
  private readonly onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: LogContext
  ) => void;
  private readonly supabase?: SupabaseClient;
  private readonly onRetrieve: RealtimeSessionConfig['onRetrieve'];
  private readonly embedText: RealtimeSessionConfig['embedText'];
  private reconnectTimer?: NodeJS.Timeout;
  private errorRetryAttempts = 0;
  private readonly maxErrorRetries = parseInt(process.env.REALTIME_MAX_ERROR_RETRIES ?? '5', 10);
  private readonly retryBackoffBaseMs = parseInt(process.env.REALTIME_RETRY_BACKOFF_MS ?? '1000', 10);
  private readonly retryBackoffCapMs = parseInt(process.env.REALTIME_RETRY_BACKOFF_CAP_MS ?? '8000', 10);

  constructor(openai: OpenAI, config: RealtimeSessionConfig, profile: RealtimeSessionProfile) {
    if (config.agentType !== profile.agentType) {
      throw new Error(
        `RealtimeAgentSession expects agentType '${profile.agentType}', received '${config.agentType}'`
      );
    }

    this.openai = openai;
    this.config = config;
    this.profile = profile;
    this.onStatusChange = config.onStatusChange;
    this.onLog = config.onLog;
    this.supabase = config.supabase;
    this.onRetrieve = config.onRetrieve;
    this.embedText = config.embedText;

    this.messageQueue = new MessageQueueManager({
      config,
      getSession: () => this.session,
      isActive: () => this.isActive,
      onLog: (level, message, context) => this.onLog?.(level, message, context),
    });

    const heartbeatConfig = {
      pingIntervalMs: parseInt(process.env.REALTIME_PING_INTERVAL_MS ?? '25000', 10),
      pongTimeoutMs: parseInt(process.env.REALTIME_PONG_TIMEOUT_MS ?? '10000', 10),
      maxMissedPongs: parseInt(process.env.REALTIME_MAX_MISSED_PONGS ?? '3', 10),
    };

    this.heartbeat = new HeartbeatManager(
      {
        agentType: this.config.agentType,
        eventId: this.config.eventId,
        getSession: () => this.session,
        isActive: () => this.isActive,
        setActive: (active) => {
          this.isActive = active;
        },
        log: (level, message, context) => this.onLog?.(level, message, context),
        notifyStatus: (status, sessionId) => this.onStatusChange?.(status, sessionId),
        updateDatabaseStatus: (status, sessionId) => this.updateDatabaseStatus(status, sessionId),
        emitError: (error) => this.emitEvent('error', error),
      },
      heartbeatConfig
    );

    this.connectionManager = new ConnectionManager({
      openai,
      onLog: (level, message) => this.onLog?.(level, message),
    });

    this.runtimeController = new RuntimeController({
      config: this.config,
      messageQueue: this.messageQueue,
      heartbeat: this.heartbeat,
      getSession: () => this.session,
      isActive: () => this.isActive,
      setActive: (active) => {
        this.isActive = active;
      },
      onLog: (level, message, context) => this.onLog?.(level, message, context),
      onStatusChange: (status, sessionId) => this.onStatusChange?.(status, sessionId),
      updateDatabaseStatus: (status, sessionId) => this.updateDatabaseStatus(status, sessionId),
      safeCloseSession: (reason) => this.safeCloseSession(reason),
      scheduleReconnect: () => this.scheduleReconnect(),
      hooksFactory: this.profile.createRuntimeHooks,
    });

    const eventRouterHooks = this.profile.createEventRouterHooks?.({
      runtimeController: this.runtimeController,
    });

    this.agentHandler = this.profile.createAgentHandler({
      context: {
        eventId: this.config.eventId,
        agentType: this.config.agentType,
        model: this.config.model,
      },
      onLog: (level, message, meta) => this.onLog?.(level, message, meta as LogContext),
      emitEvent: <K extends RealtimeSessionEvent>(
        event: K,
        payload: RealtimeSessionEventPayloads[K]
      ) => this.emitEvent(event, payload),
      sendToolResult: async (callId, output) => {
        await this.runtimeController.sendToolResult(callId, output);
      },
      onRetrieve: this.onRetrieve,
      embedText: this.embedText,
      tokenBudget: this.config.tokenBudget,
    });

    this.eventRouter = new EventRouter({
      agentHandler: this.agentHandler,
      messageQueue: this.messageQueue,
      heartbeat: this.heartbeat,
      classifyRealtimeError: (error) => this.classifyRealtimeError(error),
      onLog: (level, message) => this.onLog?.(level, message),
      onError: (error, classification) => this.handleSessionError(error, classification),
      hooks: eventRouterHooks,
    });
  }

  async connect(): Promise<string> {
    if (this.isActive) {
      throw new Error('Session already connected');
    }

    this.onLog?.('log', 'Connection attempt started');

    const intent = this.profile.getConnectionIntent(this.config);
    if (!intent.model) {
      throw new Error('Realtime session requires a model');
    }

    try {
      this.onLog?.('log', `Creating WebSocket connection with model: ${intent.model}`);
      const { session, durationMs } = await this.connectionManager.createSession(
        intent.model,
        intent.intent
      );
      this.session = session;
      this.onLog?.('log', `WebSocket created in ${durationMs}ms`);

      this.logWebSocketState('After WebSocket.create()');
      this.setupEventHandlers();

      await this.connectionManager.waitForTransportReady(this.session);
      this.logWebSocketState('After transport ready');

      const sessionConfiguration = this.createSessionConfiguration();
      await this.sendSessionConfiguration(sessionConfiguration.event);
      if (sessionConfiguration.logContext) {
        this.onLog?.('log', 'Session configuration applied', sessionConfiguration.logContext as LogContext);
      }

      this.isActive = true;
      this.logWebSocketState('After marking active');

      const sessionId =
        this.session.url.toString().split('/').pop() ||
        `session_${this.config.eventId}_${this.config.agentType}_${Date.now()}`;

      try {
        const underlyingSocket = getUnderlyingSocket(this.session);
        if (underlyingSocket) {
          underlyingSocket.__connectedAt = new Date().toISOString();
        }
      } catch {
        /* ignore */
      }

      this.heartbeat.start();
      this.onStatusChange?.('active', sessionId);
      this.errorRetryAttempts = 0;
      this.clearReconnectTimer();

      if (this.supabase) {
        await this.updateDatabaseStatus('active', sessionId);
      }

      this.onLog?.('log', `Session connected: ${sessionId} (${this.config.agentType})`);
      void this.messageQueue.processQueue();

      return sessionId;
    } catch (error: unknown) {
      const underlyingSocket = getUnderlyingSocket(this.session);
      const errorContext = {
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        message: extractErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        code: extractErrorField(error, 'code') || undefined,
        eventId: this.config.eventId,
        agentType: this.config.agentType,
        model: this.config.model,
        isActive: this.isActive,
        readyState: underlyingSocket?.readyState,
        timestamp: new Date().toISOString(),
      };

      this.onLog?.('error', `Connection failed: ${errorContext.message}`);
      this.onStatusChange?.('error');

      if (this.supabase) {
        await this.updateDatabaseStatus('error');
      }

      throw error;
    }
  }

  async pause(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      this.heartbeat.stop();
      this.logWebSocketState('Before pausing');

      if (this.session) {
        this.session.close({
          code: 1000,
          reason: 'Paused - state preserved for resume',
        });
        this.session = undefined;
      }

      this.isActive = false;
      this.onStatusChange?.('paused');

      if (this.supabase) {
        await this.updateDatabaseStatus('paused');
      }

      this.onLog?.('log', `Session paused (${this.config.agentType})`);
    } catch (error: unknown) {
      this.onLog?.('error', `Error pausing session: ${extractErrorMessage(error)}`);
      throw error;
    }
  }

  async resume(): Promise<string> {
    if (this.isActive) {
      throw new Error('Session already active');
    }
    return await this.connect();
  }

  async close(): Promise<void> {
    if (!this.isActive && !this.session) {
      return;
    }

    try {
      this.logWebSocketState('Before closing');
      this.heartbeat.stop();

      if (this.session) {
        this.session.close({
          code: 1000,
          reason: 'Normal closure',
        });
        this.session = undefined;
      }

      this.isActive = false;
      this.messageQueue.clear();
      this.onStatusChange?.('closed');

      if (this.supabase) {
        await this.updateDatabaseStatus('closed');
      }

      this.onLog?.('log', `Session closed (${this.config.agentType})`);
    } catch (error: unknown) {
      this.onLog?.('error', `Error closing session: ${extractErrorMessage(error)}`);
      throw error;
    }
  }

  getStatus(): RealtimeSessionStatus {
    const heartbeatState = this.heartbeat.getState();
    return buildStatusSnapshot({
      session: this.session,
      isActive: this.isActive,
      getQueueLength: () => this.messageQueue.getQueueLength(),
      pingState: heartbeatState,
    });
  }

  notifyStatus(status: AgentSessionLifecycleStatus, sessionId?: string): void {
    this.onStatusChange?.(status, sessionId);
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

  private createSessionConfiguration(): SessionConfiguration {
    return this.profile.createSessionConfiguration({
      config: this.config,
      log: (level, message, context) => this.onLog?.(level, message, context as LogContext),
    });
  }

  private async sendSessionConfiguration(event: RealtimeClientEvent): Promise<void> {
    if (!this.session) {
      throw new Error('Realtime session not initialized');
    }

    try {
      this.session.send(event);
      this.onLog?.('log', 'Session configuration sent');
    } catch (error: unknown) {
      const errorMessage = getLowercaseErrorField(error, 'message');
      if (errorMessage.includes('could not send data') || errorMessage.includes('not ready')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        this.session.send(event);
        this.onLog?.('log', 'Session configuration sent (after retry)');
        return;
      }
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.session.on('session.created', () => {
      this.eventRouter.handleSessionCreated();
    });

    const underlyingSocket = getUnderlyingSocket(this.session);
    if (underlyingSocket && typeof underlyingSocket.on === 'function') {
      underlyingSocket.on('pong', () => {
        this.eventRouter.handlePong();
      });
    } else {
      this.onLog?.('warn', 'Ping/pong not available on socket - SDK may handle it internally');
      this.heartbeat.stop();
    }

    this.session.on('response.function_call_arguments.done', (event: ResponseFunctionCallArgumentsDoneEvent) => {
      this.eventRouter.handleFunctionCall(event);
    });

    this.session.on('response.output_text.delta', (event: unknown) => {
      this.eventRouter.handleResponseTextDelta(event);
    });

    this.session.on('response.output_text.done', (event: ResponseTextDoneEvent) => {
      this.eventRouter.handleResponseText(event);
    });

    this.session.on('response.done', (event: ResponseDoneEvent) => {
      this.eventRouter.handleResponseDone(event);
    });

    this.session.on('error', (error: unknown) => {
      const errorMessage = getLowercaseErrorField(error, 'message');

      if (errorMessage.includes('could not close the connection')) {
        this.onLog?.('warn', `Session error ignored (close failure): ${extractErrorMessage(error)}`);
        return;
      }

      this.eventRouter.handleError(error);
    });

    this.session.on('event', (event: RealtimeServerEvent) => {
      this.eventRouter.handleGenericEvent(event);
    });

    this.profile.registerSessionEvents?.({
      session: this.session,
      router: this.eventRouter,
      runtimeController: this.runtimeController,
    });

    this.onLog?.('log', 'Event handlers registered');
  }

  private classifyRealtimeError(error: unknown): 'transient' | 'fatal' {
    if (this.profile.classifyError) {
      return this.profile.classifyError(error);
    }
    return classifyRealtimeError(error);
  }

  private emitEvent<K extends RealtimeSessionEvent>(
    event: K,
    data: RealtimeSessionEventPayloads[K]
  ): void {
    const handlers = this.eventHandlers[event];
    if (!handlers) {
      return;
    }
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error: unknown) {
        this.onLog?.('error', `Error in event handler for ${event}: ${extractErrorMessage(error)}`);
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

    const updateData = new Map<string, string>();
    updateData.set('status', status as string);
    updateData.set('updated_at', new Date().toISOString());

    if (sessionId) {
      updateData.set('provider_session_id', sessionId);
    }

    if (status === 'active' && this.config.model) {
      updateData.set('model', this.config.model);
    }

    if (status === 'closed') {
      updateData.set('closed_at', new Date().toISOString());
    }

    try {
      await this.supabase
        .from('agent_sessions')
        .update(Object.fromEntries(updateData))
        .match({
          event_id: this.config.eventId,
          agent_type: this.config.agentType,
        });
    } catch (error: unknown) {
      this.onLog?.('error', `Database status update failed: ${extractErrorMessage(error)}`);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private safeCloseSession(reason: string): void {
    if (!this.session) {
      this.runtimeController.handleSessionClosed(reason);
      return;
    }

    try {
      this.session.close({ code: 1011, reason });
    } catch (closeError: unknown) {
      this.onLog?.('warn', `Failed to close session cleanly: ${extractErrorMessage(closeError)}`);
    } finally {
      this.session = undefined;
      this.runtimeController.handleSessionClosed(reason);
    }
  }

  private transitionToErrorState(error: unknown, contextMessage?: string): void {
    this.heartbeat.stop();
    this.clearReconnectTimer();
    this.safeCloseSession('Fatal error - closing');
    this.isActive = false;
    this.errorRetryAttempts = 0;
    this.messageQueue.reset();

    const message = contextMessage ?? extractErrorMessage(error);
    this.onLog?.('error', `Session failed: ${message}`);
    this.onStatusChange?.('error');
    void this.updateDatabaseStatus('error');
    this.emitEvent('error', error instanceof Error ? error : new Error(message));
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const nextAttempt = this.errorRetryAttempts + 1;
    if (nextAttempt > this.maxErrorRetries) {
      this.transitionToErrorState(
        new Error(`Exceeded max realtime reconnect attempts (${this.maxErrorRetries})`),
        `Exceeded max realtime reconnect attempts (${this.maxErrorRetries})`
      );
      return;
    }

    const exponentialDelay = this.retryBackoffBaseMs * Math.pow(2, nextAttempt - 1);
    const delay = Math.min(exponentialDelay, this.retryBackoffCapMs);

    this.onLog?.(
      'warn',
      `Realtime session retry scheduled in ${delay}ms (attempt ${nextAttempt}/${this.maxErrorRetries})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.errorRetryAttempts = nextAttempt;

      void this.connect()
        .then(() => {
          this.errorRetryAttempts = 0;
        })
        .catch((connectError: unknown) => {
          const classification = this.classifyRealtimeError(connectError);
          const message = extractErrorMessage(connectError);
          this.onLog?.('warn', `Reconnect attempt ${this.errorRetryAttempts} failed: ${message}`);

          if (classification === 'fatal' || this.errorRetryAttempts >= this.maxErrorRetries) {
            this.transitionToErrorState(connectError, message);
            return;
          }

          this.scheduleReconnect();
        });
    }, delay);
  }

  private handleSessionError(error: unknown, classification: 'transient' | 'fatal'): void {
    const message = extractErrorMessage(error);

    if (classification === 'fatal') {
      this.transitionToErrorState(error, message);
      return;
    }

    void this.runtimeController.handleTransientError();
  }

  private logWebSocketState(operation: string, context?: Record<string, unknown>): void {
    try {
      const underlyingSocket = getUnderlyingSocket(this.session);
      const readyState = underlyingSocket?.readyState;
      const readyStateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];

      this.onLog?.(
        'log',
        `WebSocket state: ${operation}`,
        {
          readyState:
            readyState !== undefined ? `${readyState} (${readyStateNames[readyState] ?? 'UNKNOWN'})` : 'unknown',
          isActive: this.isActive,
          eventId: this.config.eventId,
          ...context,
        } as LogContext
      );
    } catch {
      /* ignore */
    }
  }

  async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    await this.runtimeController.sendMessage(message, context);
  }

  async appendAudioChunk(chunk: RealtimeAudioChunk): Promise<void> {
    await this.runtimeController.appendAudioChunk(chunk);
  }
}


