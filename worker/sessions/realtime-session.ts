/**
 * OpenAI Realtime API Session Manager
 * Manages WebSocket connections to OpenAI Realtime API for Cards and Facts agents
 */

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
import { getPolicy } from '../policies';
import type { VectorMatchRecord } from '../types';
import {
  extractErrorField,
  extractErrorMessage,
  getLowercaseErrorField,
} from './realtime-session/payload-utils';
import type {
  InputAudioTranscriptionDeltaEvent,
  RealtimeMessageContext,
  RealtimeSessionConfig,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
  RealtimeSessionStatus,
} from './realtime-session/types';
import { MessageQueueManager } from './realtime-session/message-queue';
import { buildStatusSnapshot } from './realtime-session/status-tracker';
import {
  getSessionInternals,
  getUnderlyingSocket,
} from './realtime-session/transport-utils';
import { HeartbeatManager } from './realtime-session/heartbeat-manager';
import type { AgentHandler } from './realtime-session/types';
import { createAgentHandler } from './realtime-session/handlers';
import { EventRouter } from './realtime-session/event-router';
import { RuntimeController } from './realtime-session/runtime-controller';
import { ConnectionManager } from './realtime-session/connection-manager';

export type { AgentType, RealtimeSessionConfig } from './realtime-session/types';

type JsonSchemaProperty =
  | {
      type: 'string';
      description: string;
      enum?: string[];
    }
  | {
      type: 'number';
      description: string;
      default?: number;
      minimum?: number;
      maximum?: number;
    };

interface FunctionToolSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface FunctionToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: FunctionToolSchema;
}

export class RealtimeSession {
  private openai: OpenAI;
  private session?: OpenAIRealtimeWebSocket;
  private config: RealtimeSessionConfig;
  private isActive: boolean = false;
  private readonly messageQueue: MessageQueueManager;
  private readonly heartbeat: HeartbeatManager;
  private readonly agentHandler: AgentHandler;
  private readonly runtimeController: RuntimeController;
  private readonly eventRouter: EventRouter;
  private readonly connectionManager: ConnectionManager;
  private eventHandlers: { [K in RealtimeSessionEvent]?: Array<(data: RealtimeSessionEventPayloads[K]) => void> } = {};
  private onStatusChange?: (
    status: 'active' | 'paused' | 'closed' | 'error',
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
  private readonly MAX_ERROR_RETRIES = parseInt(process.env.REALTIME_MAX_ERROR_RETRIES || '5', 10);
  private readonly RETRY_BACKOFF_BASE_MS = parseInt(process.env.REALTIME_RETRY_BACKOFF_MS || '1000', 10);
  private readonly RETRY_BACKOFF_CAP_MS = parseInt(process.env.REALTIME_RETRY_BACKOFF_CAP_MS || '8000', 10);

  constructor(openai: OpenAI, config: RealtimeSessionConfig) {
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

    // Default to transient for unknown errors to allow retry, but cap by retry count
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

  /**
   * Initialize and connect to OpenAI Realtime API
   */
  async connect(): Promise<string> {
    if (this.isActive) {
      throw new Error('Session already connected');
    }

    // Phase 1: Pre-connection validation logging
    this.onLog?.('log', 'Connection attempt started');

    const isTranscriptAgent = this.config.agentType === 'transcript';
    if (!isTranscriptAgent && !this.config.model) {
      throw new Error(`Missing realtime model for ${this.config.agentType} agent`);
    }

    const connectionModel = isTranscriptAgent ? 'gpt-realtime' : this.config.model!;
    const policy = isTranscriptAgent ? undefined : getPolicy(this.config.agentType);

    // Notify that we're connecting (but status is still 'closed' until connected)
    // Status will be updated to 'active' when connection is established

    try {
      this.onLog?.('log', `Creating WebSocket connection with model: ${connectionModel}`);
      const { session, durationMs } = await this.connectionManager.createSession(
        connectionModel,
        isTranscriptAgent ? 'transcription' : undefined
      );
      this.session = session;
      this.onLog?.('log', `WebSocket created in ${durationMs}ms`);

      // Log WebSocket state after creation
      this.logWebSocketState('After WebSocket.create()');

      // Set up event handlers BEFORE marking as active
      this.setupEventHandlers();

      await this.connectionManager.waitForTransportReady(this.session);
      this.logWebSocketState('After transport ready');

      let tools: FunctionToolDefinition[] | undefined;

      if (!isTranscriptAgent) {
        const retrieveTool: FunctionToolDefinition = {
          type: 'function',
          name: 'retrieve',
          description:
            'Retrieve relevant knowledge chunks from the vector database. Use this when you need domain-specific context, definitions, or background information that is not in the current transcript context.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'The search query to find relevant context chunks. Should be a concise description of what information you need.',
              },
              top_k: {
                type: 'number',
                description: 'Number of top chunks to retrieve (default: 5, max: 10)',
                default: 5,
                minimum: 1,
                maximum: 10,
              },
            },
            required: ['query'],
          },
        };

        tools = [retrieveTool];

        if (this.config.agentType === 'cards') {
          const produceCardTool: FunctionToolDefinition = {
            type: 'function',
            name: 'produce_card',
            description:
              'Generate a context card when content is novel and user-useful. This is the ONLY way to emit cards - you MUST use this tool instead of returning JSON directly.',
            parameters: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: [
                    'Decision',
                    'Metric',
                    'Deadline',
                    'Topic',
                    'Entity',
                    'Action',
                    'Context',
                    'Definition',
                  ],
                  description: 'The type/category of the card',
                },
                card_type: {
                  type: 'string',
                  enum: ['text', 'text_visual', 'visual'],
                  description:
                    'The card display type: "text" for text-only, "text_visual" for text with image, "visual" for image-only',
                },
                title: {
                  type: 'string',
                  description: 'Brief title for the card (aim for <= 60 characters)',
                },
                body: {
                  type: 'string',
                  description:
                    '1-3 bullet points with key information (required for text/text_visual types, null for visual type)',
                },
                label: {
                  type: 'string',
                  description:
                    'Short label for image (required for visual type; aim for <= 40 characters; null for text/text_visual types)',
                },
                image_url: {
                  type: 'string',
                  description:
                    'URL to supporting image (required for text_visual/visual types, null for text type)',
                },
                source_seq: {
                  type: 'number',
                  description:
                    'The sequence number of the source transcript that triggered this card',
                },
              },
              required: ['kind', 'card_type', 'title', 'source_seq'],
            },
          };
          tools.push(produceCardTool);
        }
      }

      const sessionUpdatePayload = isTranscriptAgent
        ? {
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
                  model: this.config.model ?? 'gpt-4o-transcribe',
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
            include: ['item.input_audio_transcription.logprobs'],
          }
        : {
            type: 'realtime' as const,
            instructions: policy,
            output_modalities: ['text'],
            max_output_tokens: 4096,
            tools,
          };

      const sessionUpdateEvent = {
        type: 'session.update',
        session: sessionUpdatePayload,
      } as unknown as RealtimeClientEvent;

      this.onLog?.(
        'log',
        isTranscriptAgent
          ? 'Sending transcription session config'
          : `Sending session config with ${tools?.length ?? 0} tools`
      );

      try {
        this.session.send(sessionUpdateEvent);

        this.onLog?.('log', 'Session configuration sent');
      } catch (error: unknown) {
        // If send fails, wait a bit and retry once
        const errorMessage = getLowercaseErrorField(error, 'message');
        if (errorMessage.includes('could not send data') || errorMessage.includes('not ready')) {
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            this.session.send(sessionUpdateEvent);
          } catch (retryError: unknown) {
            // Log but don't throw - connection might still work
            const underlyingSocket = getSessionInternals(this.session).socket;
            console.error(`[realtime] [${this.config.agentType}] Session update send failed after retry`, {
              error: extractErrorMessage(retryError),
              readyState: underlyingSocket?.readyState,
              eventId: this.config.eventId,
            });
            this.onLog?.('error', `Session update failed: ${extractErrorMessage(retryError)}`);
            // The session might still work, so we continue
          }
        } else {
          throw error;
        }
      }

      // Mark as active (connection established)
      this.isActive = true;
      
      // Log WebSocket state after marking active
      this.logWebSocketState('After marking active');

      // Get session ID from URL or generate one
      const sessionId =
        this.session.url.toString().split('/').pop() ||
        `session_${this.config.eventId}_${this.config.agentType}_${Date.now()}`;

      // Store connection timestamp on underlying socket if accessible
      try {
        const underlyingSocket = getUnderlyingSocket(this.session);
        if (underlyingSocket) {
          underlyingSocket.__connectedAt = new Date().toISOString();
        }
      } catch {
        // Ignore if we can't access underlying socket
      }

      // Start ping-pong heartbeat
      this.heartbeat.start();

      // Notify active status
      this.onStatusChange?.('active', sessionId);

      // Reset retry tracking on successful connect
      this.errorRetryAttempts = 0;
      this.clearReconnectTimer();

      // Update database
      if (this.supabase) {
        await this.updateDatabaseStatus('active', sessionId);
      }

      const connectMessage = `Session connected: ${sessionId} (${this.config.agentType})`;
      this.onLog?.('log', connectMessage);

      void this.messageQueue.processQueue();

      return sessionId;
    } catch (error: unknown) {
      // Phase 9: Enhanced error context
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

      // Notify error status
      this.onStatusChange?.('error');

      // Update database
      if (this.supabase) {
        await this.updateDatabaseStatus('error');
      }

      throw error;
    }
  }

  /**
   * Update agent_sessions table status
   */
  private async updateDatabaseStatus(
    status: 'active' | 'paused' | 'closed' | 'error',
    sessionId?: string
  ): Promise<void> {
    if (!this.supabase || !this.config.eventId) {
      return;
    }

    try {
      const updateData: {
        status: typeof status;
        updated_at: string;
        provider_session_id?: string;
        model?: string;
        closed_at?: string;
      } = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (sessionId) {
        updateData.provider_session_id = sessionId;
      }

      // Set model when connecting (uses config.model which is set from orchestrator)
      if (status === 'active' && this.config.model) {
        updateData.model = this.config.model;
      }

      if (status === 'closed') {
        updateData.closed_at = new Date().toISOString();
      }

      await this.supabase
        .from('agent_sessions')
        .update(updateData)
        .match({
          event_id: this.config.eventId,
          agent_type: this.config.agentType,
        });
    } catch (error: unknown) {
      this.onLog?.('error', `Database status update failed: ${extractErrorMessage(error)}`);
      // Don't throw - status update failure shouldn't break session
    }
  }

  /**
   * Set up event handlers for Realtime API events
   */
  private setupEventHandlers(): void {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    // Handle session creation
    this.session.on('session.created', () => {
      this.eventRouter.handleSessionCreated();
    });

    if (this.config.agentType === 'transcript') {
      this.session.on(
        'conversation.item.input_audio_transcription.delta',
        (event: InputAudioTranscriptionDeltaEvent) => {
          this.eventRouter.handleTranscriptionDelta(event);
        }
      );

      this.session.on('conversation.item.input_audio_transcription.completed', (event: unknown) => {
        this.eventRouter.handleTranscriptionCompleted(event);
      });
    }

    // Handle pong responses (WebSocket ping-pong)
    // Note: OpenAI SDK may handle ping/pong at the WebSocket level, but we'll track it
    // Check if the underlying socket supports ping/pong events
    const underlyingSocket = getUnderlyingSocket(this.session);
    if (underlyingSocket && typeof underlyingSocket.on === 'function') {
      // Standard WebSocket 'pong' event (fires when pong frame is received)
      underlyingSocket.on('pong', () => {
        this.eventRouter.handlePong();
      });
    } else {
      // Ping/pong not available on this socket - disable ping/pong mechanism
      this.onLog?.('warn', 'Ping/pong not available on socket - SDK may handle it internally');
      this.heartbeat.stop();
    }

    // Handle function call arguments completion
    // When agent calls a tool, we receive the arguments and need to execute the tool
    this.session.on('response.function_call_arguments.done', (event: ResponseFunctionCallArgumentsDoneEvent) => {
      this.eventRouter.handleFunctionCall(event);
    });

    // Handle response text completion (for JSON responses)
    this.session.on('response.output_text.delta', (event: unknown) => {
      this.eventRouter.handleResponseTextDelta(event);
    });

    this.session.on('response.output_text.done', (event: ResponseTextDoneEvent) => {
      this.eventRouter.handleResponseText(event);
    });

    this.session.on('response.done', (event: ResponseDoneEvent) => {
      this.eventRouter.handleResponseDone(event);
    });

    // Handle errors
    this.session.on('error', (error: unknown) => {
      const errorMessage = getLowercaseErrorField(error, 'message');

      if (errorMessage.includes('could not close the connection')) {
        console.warn(`[realtime] Session error: ${extractErrorMessage(error)} (ignored close failure)`);
        return;
      }

      this.eventRouter.handleError(error);
    });

    // Generic event handler for debugging
    this.session.on('event', (event: RealtimeServerEvent) => {
      this.eventRouter.handleGenericEvent(event);
    });

    // Phase 5: Event handler registration confirmation (after all handlers are registered)
    const handlersRegistered = [
      'session.created',
      'response.function_call_arguments.done',
      'response.output_text.delta',
      'response.output_text.done',
      'response.done',
      'error',
      'event',
    ];

    if (this.config.agentType === 'transcript') {
      handlersRegistered.push(
        'conversation.item.input_audio_transcription.delta',
        'conversation.item.input_audio_transcription.completed'
      );
    }

    console.log(
      `[${new Date().toISOString()}] [realtime] [${this.config.agentType}] Event handlers registered`,
      {
        handlersRegistered,
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

  /**
   * Send a message to the Realtime session
   */
  async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    await this.runtimeController.sendMessage(message, context);
  }

  async appendAudioChunk(chunk: {
    audioBase64: string;
    isFinal?: boolean;
    sampleRate?: number;
    bytesPerSample?: number;
    encoding?: string;
    durationMs?: number;
    speaker?: string;
  }): Promise<void> {
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

  /**
   * Register event handler
   */
  on<K extends RealtimeSessionEvent>(
    event: K,
    handler: (data: RealtimeSessionEventPayloads[K]) => void
  ): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event]!.push(handler);
  }

  /**
   * Get session status
   */
  getStatus(): RealtimeSessionStatus {
    const heartbeatState = this.heartbeat.getState();
    return buildStatusSnapshot({
      session: this.session,
      isActive: this.isActive,
      getQueueLength: () => this.messageQueue.getQueueLength(),
      pingState: heartbeatState,
    });
  }

  notifyStatus(status: 'active' | 'paused' | 'closed' | 'error', sessionId?: string): void {
    this.onStatusChange?.(status, sessionId);
  }

  /**
   * Phase 7: Log WebSocket state transitions for debugging
   */
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
      // Ignore if we can't access state
    }
  }

  /**
   * Pause the session (close WebSocket but preserve state for resume)
   */
  async pause(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      // Stop ping-pong heartbeat
      this.heartbeat.stop();

      // Log WebSocket state before pausing
      this.logWebSocketState('Before pausing');

      // Close WebSocket
      if (this.session) {
        this.session.close({
          code: 1000,
          reason: 'Paused - state preserved for resume',
        });
        this.session = undefined;
      }

      this.isActive = false;
      // Note: Don't clear messageQueue - preserve for resume

      // Notify paused status
      this.onStatusChange?.('paused');

      // Update database
      if (this.supabase) {
        await this.updateDatabaseStatus('paused');
      }

      console.log(`[${new Date().toISOString()}] [realtime] Session paused (${this.config.agentType})`);
    } catch (error: unknown) {
      console.error(`[${new Date().toISOString()}] [realtime] Error pausing session: ${extractErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Resume a paused session (reconnect and restore state)
   */
  async resume(): Promise<string> {
    if (this.isActive) {
      throw new Error('Session already active');
    }

    // Reconnect using the same connect() logic
    return await this.connect();
  }

  /**
   * Close the session permanently
   */
  async close(): Promise<void> {
    if (!this.isActive && !this.session) {
      // Already closed or paused
      return;
    }

    try {
      // Log WebSocket state before closing
      this.logWebSocketState('Before closing');

      // Stop heartbeat before closing
      this.heartbeat.stop();

      // Close WebSocket if it exists
      if (this.session) {
        this.session.close({
          code: 1000,
          reason: 'Normal closure',
        });
        this.session = undefined;
      }

      this.isActive = false;
      this.messageQueue.clear();

      // Notify closed status
      this.onStatusChange?.('closed');

      // Update database
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
