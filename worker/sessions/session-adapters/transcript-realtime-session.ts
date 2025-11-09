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
import { getPolicy } from '../../policies';
import type { VectorMatchRecord } from '../../types';
import {
  extractErrorField,
  extractErrorMessage,
  getLowercaseErrorField,
} from './payload-utils';
import type {
  AgentRealtimeSession,
  AgentSessionLifecycleStatus,
  InputAudioTranscriptionDeltaEvent,
  RealtimeAudioChunk,
  RealtimeMessageContext,
  RealtimeSessionConfig,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
  RealtimeSessionStatus,
} from './types';
import { MessageQueueManager } from './message-queue';
import { buildStatusSnapshot } from './status-tracker';
import { getUnderlyingSocket } from './transport-utils';
import { HeartbeatManager } from './heartbeat-manager';
import type { AgentHandler } from './types';
import { createAgentHandler } from './handlers';
import { EventRouter } from './event-router';
import { RuntimeController } from './runtime-controller';
import { ConnectionManager } from './connection-manager';

const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
const REALTIME_TRANSCRIPTION_MODEL = 'gpt-realtime';

/**
 * TranscriptRealtimeSession
 * Dedicated manager for the transcript agent's realtime socket lifecycle.
 */
export class TranscriptRealtimeSession implements AgentRealtimeSession {
  private openai: OpenAI;
  private session?: OpenAIRealtimeWebSocket;
  private config: RealtimeSessionConfig;
  private isActive = false;
  private readonly messageQueue: MessageQueueManager;
  private readonly heartbeat: HeartbeatManager;
  private readonly agentHandler: AgentHandler;
  private readonly runtimeController: RuntimeController;
  private readonly eventRouter: EventRouter;
  private readonly connectionManager: ConnectionManager;
  private eventHandlers: {
    [K in RealtimeSessionEvent]?: Array<(data: RealtimeSessionEventPayloads[K]) => void>;
  } = {};
  private onStatusChange?: (
    status: AgentSessionLifecycleStatus,
    sessionId?: string
  ) => void;
  private onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ) => void;
  private supabase?: SupabaseClient;
  private onRetrieve?: (query: string, topK: number) => Promise<VectorMatchRecord[]>;
  private embedText?: (text: string) => Promise<number[]>;
  private reconnectTimer?: NodeJS.Timeout;
  private errorRetryAttempts = 0;
  private readonly MAX_ERROR_RETRIES = parseInt(
    process.env.REALTIME_MAX_ERROR_RETRIES || '5',
    10
  );
  private readonly RETRY_BACKOFF_BASE_MS = parseInt(
    process.env.REALTIME_RETRY_BACKOFF_MS || '1000',
    10
  );
  private readonly RETRY_BACKOFF_CAP_MS = parseInt(
    process.env.REALTIME_RETRY_BACKOFF_CAP_MS || '8000',
    10
  );

  constructor(openai: OpenAI, config: RealtimeSessionConfig) {
    if (config.agentType !== 'transcript') {
      throw new Error(
        `TranscriptRealtimeSession expects agentType 'transcript', received '${config.agentType}'`
      );
    }

    this.openai = openai;
    this.config = config;
    this.onStatusChange = config.onStatusChange;
    this.onLog = config.onLog;
    this.supabase = config.supabase;
    this.onRetrieve = config.onRetrieve;
    this.embedText = config.embedText;
    this.messageQueue = new MessageQueueManager({
      config,
      getSession: () => this.session,
      isActive: () => this.isActive,
      onLog: this.onLog,
    });

    const heartbeatConfig = {
      pingIntervalMs: parseInt(process.env.REALTIME_PING_INTERVAL_MS || '25000', 10),
      pongTimeoutMs: parseInt(process.env.REALTIME_PONG_TIMEOUT_MS || '10000', 10),
      maxMissedPongs: parseInt(process.env.REALTIME_MAX_MISSED_PONGS || '3', 10),
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
    });

    this.connectionManager = new ConnectionManager({
      openai,
      onLog: (level, message) => this.onLog?.(level, message),
    });

    this.agentHandler = createAgentHandler({
      context: {
        eventId: this.config.eventId,
        agentType: this.config.agentType,
        model: this.config.model,
      },
      onLog: (level, message, meta) => this.onLog?.(level, message, meta),
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
      onSessionUpdated: () => this.runtimeController.markTranscriptReady(),
    });
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
      console.warn(
        `[realtime] Failed to close session cleanly: ${extractErrorMessage(closeError)}`
      );
    } finally {
      this.session = undefined;
      this.runtimeController.handleSessionClosed(reason);
    }
  }

  private classifyRealtimeError(error: unknown): 'transient' | 'fatal' {
    const message = getLowercaseErrorField(error, 'message');
    const code = getLowercaseErrorField(error, 'code');
    const type = getLowercaseErrorField(error, 'type');

    const transientIndicators = [
      'not ready',
      'could not send data',
      'connection closed',
      'connection reset',
      'timeout',
      'temporarily unavailable',
      'buffer too small',
      'ping',
      'pong',
      'retry later',
      'rate limit',
      '503',
      '504',
    ];

    if (transientIndicators.some((indicator) => message.includes(indicator))) {
      return 'transient';
    }

    const fatalIndicators = [
      'unknown parameter',
      'invalid api key',
      'api key not valid',
      'unauthorized',
      'forbidden',
      'unsupported',
      'malformed',
      'invalid_request_error',
      'policy violation',
    ];

    if (fatalIndicators.some((indicator) => message.includes(indicator))) {
      return 'fatal';
    }
    if (fatalIndicators.some((indicator) => code.includes(indicator) || type.includes(indicator))) {
      return 'fatal';
    }

    if (type === 'invalid_request_error') {
      return 'fatal';
    }

    return 'transient';
  }

  private transitionToErrorState(error: unknown, contextMessage?: string): void {
    this.heartbeat.stop();
    this.clearReconnectTimer();
    this.safeCloseSession('Fatal error - closing');
    this.isActive = false;
    this.errorRetryAttempts = 0;
    this.messageQueue.reset();

    const message = contextMessage || extractErrorMessage(error);
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
    if (nextAttempt > this.MAX_ERROR_RETRIES) {
      this.transitionToErrorState(
        new Error(`Exceeded max realtime reconnect attempts (${this.MAX_ERROR_RETRIES})`),
        `Exceeded max realtime reconnect attempts (${this.MAX_ERROR_RETRIES})`
      );
      return;
    }

    const exponentialDelay = this.RETRY_BACKOFF_BASE_MS * Math.pow(2, nextAttempt - 1);
    const delay = Math.min(exponentialDelay, this.RETRY_BACKOFF_CAP_MS);

    this.onLog?.(
      'warn',
      `Realtime session retry scheduled in ${delay}ms (attempt ${nextAttempt}/${this.MAX_ERROR_RETRIES})`
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
          console.warn(`[realtime] Reconnect attempt ${this.errorRetryAttempts} failed: ${message}`);
          this.onLog?.('warn', `Reconnect attempt ${this.errorRetryAttempts} failed: ${message}`);

          if (classification === 'fatal' || this.errorRetryAttempts >= this.MAX_ERROR_RETRIES) {
            this.transitionToErrorState(connectError, message);
            return;
          }

          this.scheduleReconnect();
        });
    }, delay);
  }

  async connect(): Promise<string> {
    if (this.isActive) {
      throw new Error('Session already connected');
    }

    this.onLog?.('log', 'Connection attempt started');

    const sessionPolicy = getPolicy('transcript');

    try {
      this.onLog?.('log', `Creating WebSocket connection with model: ${REALTIME_TRANSCRIPTION_MODEL}`);
      const { session, durationMs } = await this.connectionManager.createSession(
        REALTIME_TRANSCRIPTION_MODEL,
        'transcription'
      );
      this.session = session;
      this.onLog?.('log', `WebSocket created in ${durationMs}ms`);

      this.logWebSocketState('After WebSocket.create()');
      this.setupEventHandlers();

      await this.connectionManager.waitForTransportReady(this.session);
      this.logWebSocketState('After transport ready');

      const sessionUpdateEvent = {
        type: 'session.update',
        session: {
          type: 'transcription' as const,
          audio: {
            input: {
              format: {
                type: 'audio/pcm' as const,
                rate: 24000,
              },
              noise_reduction: {
                type: 'near_field' as const,
              },
              transcription: {
                model: this.config.model ?? DEFAULT_TRANSCRIPTION_MODEL,
                language: 'en',
              },
              turn_detection: {
                type: 'server_vad' as const,
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
              },
            },
          },
          instructions: sessionPolicy,
          include: ['item.input_audio_transcription.logprobs'],
        },
      } as unknown as RealtimeClientEvent;

      this.onLog?.('log', 'Sending transcription session config');

      try {
        this.session.send(sessionUpdateEvent);
        this.onLog?.('log', 'Session configuration sent');
      } catch (error: unknown) {
        const errorMessage = getLowercaseErrorField(error, 'message');
        if (errorMessage.includes('could not send data') || errorMessage.includes('not ready')) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          this.session.send(sessionUpdateEvent);
        } else {
          throw error;
        }
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

  private setupEventHandlers(): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.session.on('session.created', () => {
      this.eventRouter.handleSessionCreated();
    });

    this.session.on(
      'conversation.item.input_audio_transcription.delta',
      (event: InputAudioTranscriptionDeltaEvent) => {
        this.eventRouter.handleTranscriptionDelta(event);
      }
    );

    this.session.on('conversation.item.input_audio_transcription.completed', (event: unknown) => {
      this.eventRouter.handleTranscriptionCompleted(event);
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
        console.warn(`[realtime] Session error: ${extractErrorMessage(error)} (ignored close failure)`);
        return;
      }

      this.eventRouter.handleError(error);
    });

    this.session.on('event', (event: RealtimeServerEvent) => {
      this.eventRouter.handleGenericEvent(event);
    });

    console.log(
      `[${new Date().toISOString()}] [realtime] [${this.config.agentType}] Event handlers registered`,
      {
        handlersRegistered: [
          'session.created',
          'conversation.item.input_audio_transcription.delta',
          'conversation.item.input_audio_transcription.completed',
          'response.function_call_arguments.done',
          'response.output_text.delta',
          'response.output_text.done',
          'response.done',
          'error',
          'event',
        ],
        eventId: this.config.eventId,
      }
    );
    this.onLog?.('log', 'Event handlers registered');
  }

  private handleSessionError(error: unknown, classification: 'transient' | 'fatal'): void {
    const message = extractErrorMessage(error);

    if (classification === 'fatal') {
      this.transitionToErrorState(error, message);
      return;
    }

    void this.runtimeController.handleTransientError();
  }

  async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    await this.runtimeController.sendMessage(message, context);
  }

  async appendAudioChunk(chunk: RealtimeAudioChunk): Promise<void> {
    await this.runtimeController.appendAudioChunk(chunk);
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
        console.error(
          `[realtime] Error in event handler for ${event}: ${extractErrorMessage(error)}`
        );
      }
    });
  }

  on<K extends RealtimeSessionEvent>(
    event: K,
    handler: (data: RealtimeSessionEventPayloads[K]) => void
  ): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event]!.push(handler);
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

  private logWebSocketState(operation: string, context?: Record<string, unknown>): void {
    try {
      const underlyingSocket = getUnderlyingSocket(this.session);
      const readyState = underlyingSocket?.readyState;
      const readyStateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];

      console.log(`[${new Date().toISOString()}] [realtime] [${this.config.agentType}] WebSocket state: ${operation}`, {
        readyState: readyState !== undefined ? `${readyState} (${readyStateNames[readyState]})` : 'unknown',
        isActive: this.isActive,
        eventId: this.config.eventId,
        ...context,
      });
    } catch {
      /* ignore */
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

      console.log(`[${new Date().toISOString()}] [realtime] Session paused (${this.config.agentType})`);
    } catch (error: unknown) {
      console.error(`[${new Date().toISOString()}] [realtime] Error pausing session: ${extractErrorMessage(error)}`);
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

      console.log(`[${new Date().toISOString()}] [realtime] Session closed (${this.config.agentType})`);
    } catch (error: unknown) {
      console.error(`[${new Date().toISOString()}] [realtime] Error closing session: ${extractErrorMessage(error)}`);
      throw error;
    }
  }
}

