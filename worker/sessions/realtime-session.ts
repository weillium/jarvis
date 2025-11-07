/**
 * OpenAI Realtime API Session Manager
 * Manages WebSocket connections to OpenAI Realtime API for Cards and Facts agents
 */

import type OpenAI from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type {
  ConversationItemCreateEvent,
  RealtimeClientEvent,
  RealtimeServerEvent,
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '../policies';
import {
  createRealtimeCardsUserPrompt,
  createRealtimeFactsUserPrompt,
} from '../prompts';
import type {
  Fact,
  RealtimeCardDTO,
  RealtimeFactDTO,
  RealtimeModelResponseDTO,
  RealtimeToolCallDTO,
  RealtimeTranscriptDTO,
  VectorMatchRecord
} from '../types';

export type AgentType = 'transcript' | 'cards' | 'facts';

export interface RealtimeSessionConfig {
  eventId: string;
  agentType: 'transcript' | 'cards' | 'facts';
  model?: string;
  onStatusChange?: (
    status: 'active' | 'paused' | 'closed' | 'error',
    sessionId?: string
  ) => void;
  onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ) => void;
  supabase?: SupabaseClient; // Supabase client for database updates
  // Callbacks for tool execution
  onRetrieve?: (query: string, topK: number) => Promise<VectorMatchRecord[]>;
  embedText?: (text: string) => Promise<number[]>;
}

const CARD_TYPES: ReadonlySet<RealtimeCardDTO['card_type']> = new Set([
  'text',
  'text_visual',
  'visual',
]);

const safeJsonParse = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const clampTopK = (value: number): number => {
  const normalized = Number.isFinite(value) ? Math.floor(value) : 5;
  return Math.min(10, Math.max(1, normalized));
};

const mapToolCallArguments = (
  args: unknown,
  callId: string
): RealtimeToolCallDTO | null => {
  if (!isRecord(args)) {
    return null;
  }

  if (typeof args.query === 'string') {
    const topKValue = typeof args.top_k === 'number' ? clampTopK(args.top_k) : 5;
    return {
      type: 'retrieve',
      callId,
      query: args.query,
      topK: topKValue,
    };
  }

  const card = mapCardFromRecord(args);
  if (card) {
    return {
      type: 'produce_card',
      callId,
      card,
    };
  }

  return null;
};

const mapCardFromRecord = (record: Record<string, unknown>): RealtimeCardDTO | null => {
  if (
    typeof record.kind !== 'string' ||
    typeof record.card_type !== 'string' ||
    typeof record.title !== 'string'
  ) {
    return null;
  }

  const cardType = CARD_TYPES.has(record.card_type as RealtimeCardDTO['card_type'])
    ? (record.card_type as RealtimeCardDTO['card_type'])
    : 'text';

  const sourceSeq =
    typeof record.source_seq === 'number' ? record.source_seq : 0;

  return {
    kind: record.kind,
    card_type: cardType,
    title: record.title,
    body: typeof record.body === 'string' ? record.body : null,
    label: typeof record.label === 'string' ? record.label : null,
    image_url: typeof record.image_url === 'string' ? record.image_url : null,
    source_seq: sourceSeq,
  };
};

const mapCardPayload = (payload: unknown): RealtimeCardDTO | null => {
  if (!isRecord(payload)) {
    return null;
  }
  return mapCardFromRecord(payload);
};

const mapFactsPayload = (payload: unknown): RealtimeFactDTO[] => {
  if (Array.isArray(payload)) {
    return payload
      .map(mapFactCandidate)
      .filter((fact): fact is RealtimeFactDTO => fact !== null);
  }

  if (isRecord(payload) && Array.isArray(payload.facts)) {
    return payload.facts
      .map(mapFactCandidate)
      .filter((fact): fact is RealtimeFactDTO => fact !== null);
  }

  return [];
};

const mapFactCandidate = (value: unknown): RealtimeFactDTO | null => {
  if (!isRecord(value) || typeof value.key !== 'string' || !('value' in value)) {
    return null;
  }

  const fact: RealtimeFactDTO = {
    key: value.key,
    value: value.value,
  };

  if (typeof value.confidence === 'number') {
    fact.confidence = value.confidence;
  }

  return fact;
};

const extractErrorField = (
  value: unknown,
  field: 'message' | 'code' | 'type'
): string => {
  if (value instanceof Error && field === 'message') {
    return value.message;
  }
  if (isRecord(value)) {
    const fieldValue = value[field];
    if (typeof fieldValue === 'string') {
      return fieldValue;
    }
  }
  return '';
};

const extractErrorMessage = (value: unknown): string => {
  const message = extractErrorField(value, 'message');
  if (message) {
    return message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return 'Unknown error';
  }
};

const getLowercaseErrorField = (
  value: unknown,
  field: 'message' | 'code' | 'type'
): string => extractErrorField(value, field).toLowerCase();

const isInvalidToolCallError = (error: unknown): boolean =>
  getLowercaseErrorField(error, 'message').includes('invalid_tool_call_id');

interface SocketLike {
  readyState?: number;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  addEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  OPEN?: number;
  __connectedAt?: string;
  ping?: () => void;
}

interface TransportLike {
  state?: string;
  readyState?: string | number;
  addEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

const isSocketLike = (value: unknown): value is SocketLike =>
  isRecord(value) &&
  (typeof value.readyState === 'number' ||
    typeof value.on === 'function' ||
    typeof value.addEventListener === 'function' ||
    typeof value.ping === 'function');

const isTransportLike = (value: unknown): value is TransportLike =>
  isRecord(value) &&
  (typeof value.state === 'string' ||
    typeof value.readyState === 'string' ||
    typeof value.readyState === 'number');

const getSessionInternals = (
  session: OpenAIRealtimeWebSocket | undefined
): { transport?: TransportLike; socket?: SocketLike } => {
  if (!session) {
    return {};
  }

  const candidate = session as unknown;
  if (!isRecord(candidate)) {
    return {};
  }

  const transport = isTransportLike(candidate.transport) ? candidate.transport : undefined;
  const socketCandidate =
    isSocketLike(candidate.socket) ? candidate.socket : isSocketLike(candidate.ws) ? candidate.ws : undefined;

  return {
    transport,
    socket: socketCandidate,
  };
};

const getUnderlyingSocket = (
  session: OpenAIRealtimeWebSocket | undefined
): SocketLike | undefined => getSessionInternals(session).socket;

const extractAssistantText = (event: ResponseDoneEvent): string | null => {
  const items = event.response.output;
  if (!Array.isArray(items)) {
    return null;
  }

  for (const item of items) {
    if (
      isRecord(item) &&
      item.type === 'message' &&
      item.role === 'assistant' &&
      Array.isArray(item.content)
    ) {
      const textContent = item.content.find(
        (content) =>
          isRecord(content) &&
          typeof content.type === 'string' &&
          content.type === 'text' &&
          typeof content.text === 'string'
      );
      if (textContent && typeof textContent.text === 'string') {
        return textContent.text;
      }
    }
  }

  return null;
};

export interface RealtimeSessionStatus {
  isActive: boolean;
  queueLength: number;
  websocketState?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  connectionUrl?: string;
  sessionId?: string;
  connectedAt?: string;
  pingPong?: {
    enabled: boolean;
    missedPongs: number;
    lastPongReceived?: string;
    pingIntervalMs: number;
    pongTimeoutMs: number;
    maxMissedPongs: number;
  };
}

interface RealtimeMessageContext {
  bullets?: string[];
  glossaryContext?: string;
  recentText?: string;
  facts?: Fact[] | Record<string, unknown>;
}

type RealtimeSessionEvent = 'card' | 'response' | 'facts' | 'transcript' | 'error';

type RealtimeSessionEventPayloads = {
  card: RealtimeCardDTO;
  response: RealtimeModelResponseDTO;
  facts: RealtimeFactDTO[];
  transcript: RealtimeTranscriptDTO;
  error: Error;
};

export class RealtimeSession {
  private openai: OpenAI;
  private session?: OpenAIRealtimeWebSocket;
  private config: RealtimeSessionConfig;
  private isActive: boolean = false;
  private messageQueue: Array<{ message: string; context?: RealtimeMessageContext }> = [];
  private currentMessage: { message: string; context?: RealtimeMessageContext } | null = null;
  private pendingResponse: boolean = false;
  private pendingAudioBytes: number = 0;
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
  
  // Ping-pong heartbeat tracking
  private pingInterval?: NodeJS.Timeout;
  private pongTimeout?: NodeJS.Timeout;
  private missedPongs: number = 0;
  private lastPongReceived?: Date;
  private pingStartTime?: number; // Track ping start time for latency calculation
  private readonly PING_INTERVAL_MS = parseInt(process.env.REALTIME_PING_INTERVAL_MS || '25000', 10); // Default 25 seconds
  private readonly PONG_TIMEOUT_MS = parseInt(process.env.REALTIME_PONG_TIMEOUT_MS || '10000', 10); // Default 10 seconds
  private readonly MAX_MISSED_PONGS = parseInt(process.env.REALTIME_MAX_MISSED_PONGS || '3', 10); // Reconnect after 3 missed pongs
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
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private safeCloseSession(reason: string): void {
    if (!this.session) {
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
    this.stopPingPong();
    this.clearReconnectTimer();
    this.safeCloseSession('Fatal error - closing');
    this.isActive = false;
    this.errorRetryAttempts = 0;
    this.pendingAudioBytes = 0;
    this.pendingResponse = false;
    this.currentMessage = null;
    this.messageQueue = [];

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

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      this.errorRetryAttempts = nextAttempt;

      try {
        await this.connect();
        this.errorRetryAttempts = 0;
      } catch (connectError: unknown) {
        const classification = this.classifyRealtimeError(connectError);
        const message = extractErrorMessage(connectError);
        console.warn(`[realtime] Reconnect attempt ${this.errorRetryAttempts} failed: ${message}`);
        this.onLog?.('warn', `Reconnect attempt ${this.errorRetryAttempts} failed: ${message}`);

        if (classification === 'fatal' || this.errorRetryAttempts >= this.MAX_ERROR_RETRIES) {
          this.transitionToErrorState(connectError, message);
          return;
        }

        this.scheduleReconnect();
      }
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

    const model = this.config.model || 'gpt-4o-realtime-preview-2024-10-01';
    const policy = getPolicy(this.config.agentType);

    // Notify that we're connecting (but status is still 'closed' until connected)
    // Status will be updated to 'active' when connection is established

    try {

      // Phase 2: WebSocket creation timing
      const connectStartTime = Date.now();
      this.onLog?.('log', `Creating WebSocket connection with model: ${model}`);

      // Create actual WebSocket connection
      this.session = await OpenAIRealtimeWebSocket.create(this.openai, {
        model,
        dangerouslyAllowBrowser: false,
      });

      // Log WebSocket creation success
      const connectDuration = Date.now() - connectStartTime;
      this.onLog?.('log', `WebSocket created in ${connectDuration}ms`);
      
      // Log WebSocket state after creation
      this.logWebSocketState('After WebSocket.create()');

      // Set up event handlers BEFORE marking as active
      this.setupEventHandlers();

      await this.waitForTransportReady();
      this.logWebSocketState('After transport ready');

      // Define retrieve tool for RAG (available to all agents)
      const retrieveTool: any = {
        type: 'function',
        name: 'retrieve',
        description: 'Retrieve relevant knowledge chunks from the vector database. Use this when you need domain-specific context, definitions, or background information that is not in the current transcript context.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant context chunks. Should be a concise description of what information you need.',
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

      // Define produce_card tool (only for Cards agent)
      const tools: any[] = [retrieveTool];
      
      if (this.config.agentType === 'cards') {
        const produceCardTool: any = {
          type: 'function',
          name: 'produce_card',
          description: 'Generate a context card when content is novel and user-useful. This is the ONLY way to emit cards - you MUST use this tool instead of returning JSON directly.',
          parameters: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['Decision', 'Metric', 'Deadline', 'Topic', 'Entity', 'Action', 'Context', 'Definition'],
                description: 'The type/category of the card',
              },
              card_type: {
                type: 'string',
                enum: ['text', 'text_visual', 'visual'],
                description: 'The card display type: "text" for text-only, "text_visual" for text with image, "visual" for image-only',
              },
              title: {
                type: 'string',
                description: 'Brief title for the card (max 60 characters)',
                maxLength: 60,
              },
              body: {
                type: 'string',
                description: '1-3 bullet points with key information (required for text/text_visual types, null for visual type)',
              },
              label: {
                type: 'string',
                description: 'Short label for image (required for visual type, max 40 characters, null for text/text_visual types)',
                maxLength: 40,
              },
              image_url: {
                type: 'string',
                description: 'URL to supporting image (required for text_visual/visual types, null for text type)',
              },
              source_seq: {
                type: 'number',
                description: 'The sequence number of the source transcript that triggered this card',
              },
            },
            required: ['kind', 'card_type', 'title', 'source_seq'],
          },
        };
        tools.push(produceCardTool);
      }

      // Configure session (instructions, output format, tools, etc.)
      // Note: For Cards agent, we remove response_format requirement since output is via tool
      // Wrap in try-catch to handle cases where connection isn't fully ready
      
      // Phase 4: Session configuration send logging
      this.onLog?.('log', `Sending session config with ${tools.length} tools`);
      
      try {
        this.session.send({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: policy,
            output_modalities: ['text'],
            max_output_tokens: 4096,
            tools,
            audio: this.config.agentType === 'transcript'
              ? {
                  input: {
                    format: {
                      type: 'audio/pcm',
                      rate: 24000,
                    },
                  },
                }
              : undefined,
          },
        } as RealtimeClientEvent);
        
        this.onLog?.('log', 'Session configuration sent');
      } catch (error: unknown) {
        // If send fails, wait a bit and retry once
        const errorMessage = getLowercaseErrorField(error, 'message');
        if (errorMessage.includes('could not send data') || errorMessage.includes('not ready')) {
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            this.session.send({
              type: 'session.update',
              session: {
                type: 'realtime',
                instructions: policy,
                output_modalities: ['text'],
                max_output_tokens: 4096,
                tools,
              },
            } as RealtimeClientEvent);
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
      } catch (error: unknown) {
        // Ignore if we can't access underlying socket
      }

      // Start ping-pong heartbeat
      this.startPingPong();

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

      void this.processQueue();

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
      const message = `Session created (${this.config.agentType})`;
      this.onLog?.('log', message);
    });

    // Handle pong responses (WebSocket ping-pong)
    // Note: OpenAI SDK may handle ping/pong at the WebSocket level, but we'll track it
    // Check if the underlying socket supports ping/pong events
    const underlyingSocket = getUnderlyingSocket(this.session);
    if (underlyingSocket && typeof underlyingSocket.on === 'function') {
      // Standard WebSocket 'pong' event (fires when pong frame is received)
      underlyingSocket.on('pong', () => {
        this.handlePong();
      });
    } else {
      // Ping/pong not available on this socket - disable ping/pong mechanism
      this.onLog?.('warn', 'Ping/pong not available on socket - SDK may handle it internally');
      this.stopPingPong();
    }

    // Handle function call arguments completion
    // When agent calls a tool, we receive the arguments and need to execute the tool
    this.session.on(
      'response.function_call_arguments.done',
      async (event: ResponseFunctionCallArgumentsDoneEvent) => {
        try {
          const parsedArgs = safeJsonParse<Record<string, unknown>>(event.arguments);
          if (parsedArgs === null) {
            this.onLog?.('warn', 'Failed to parse function call arguments');
            return;
          }

          const toolCall = mapToolCallArguments(parsedArgs, event.call_id);
          if (!toolCall) {
            this.onLog?.('warn', 'Received unsupported tool call arguments');
            return;
          }

          if (toolCall.type === 'retrieve') {
            const { query, topK, callId } = toolCall;
            this.onLog?.('log', `retrieve() called: query="${query}", top_k=${topK}`);

            if (!this.onRetrieve) {
              this.onLog?.('warn', 'retrieve() called but no onRetrieve callback provided');
              await this.sendToolResult(callId, { chunks: [] });
              return;
            }

            try {
              const results = await this.onRetrieve(query, topK);
              await this.sendToolResult(callId, {
                chunks: results.map((r) => ({
                  id: r.id,
                  chunk: r.chunk,
                  similarity: r.similarity,
                })),
              });
              this.onLog?.('log', `retrieve() returned ${results.length} chunks`);
            } catch (toolError: unknown) {
              const errorMessage = extractErrorMessage(toolError);
              this.onLog?.('error', `Error executing retrieve(): ${errorMessage}`);
              await this.sendToolResult(callId, { error: errorMessage, chunks: [] });
            }
          } else if (toolCall.type === 'produce_card') {
            const card = toolCall.card;
            this.onLog?.('log', `produce_card() called: kind="${card.kind}", card_type="${card.card_type}"`, {
              seq: card.source_seq,
            });
            this.emitEvent('card', card);

            await this.sendToolResult(toolCall.callId, {
              success: true,
              card_id: `card_${Date.now()}`,
            });
            this.onLog?.('log', `produce_card() completed: ${card.kind} card`, { seq: card.source_seq });
          }
        } catch (error: unknown) {
          this.onLog?.('error', `Error handling function call: ${extractErrorMessage(error)}`);
        }
      }
    );

    // Handle response text completion (for JSON responses)
    this.session.on(
      'response.output_text.done',
      async (event: ResponseTextDoneEvent) => {
        try {
          if (this.config.agentType === 'transcript') {
            const text = event.text?.trim() ?? '';
            if (text.length === 0) {
              return;
            }

            this.emitEvent('transcript', {
              text,
              isFinal: true,
              receivedAt: new Date().toISOString(),
            });
            return;
          }

          if (!event.text) {
            return;
          }

          const parsedResponse = safeJsonParse<unknown>(event.text);
          if (parsedResponse === null) {
            this.onLog?.('warn', 'Failed to parse response text as JSON');
            return;
          }

          this.emitEvent('response', { raw: parsedResponse });

          if (this.config.agentType === 'cards') {
            const card = mapCardPayload(parsedResponse);
            if (card) {
              this.emitEvent('card', card);
            }
          } else {
            const factsArray = mapFactsPayload(parsedResponse);
            if (factsArray.length > 0) {
              this.emitEvent('facts', factsArray);
            }
          }
        } catch (error: unknown) {
          const formatted = extractErrorMessage(error);
          console.error(`[realtime] Error parsing response: ${formatted}`);
          this.emitEvent('error', error instanceof Error ? error : new Error(formatted));
        }
      }
    );

    // Handle response completion (fallback if text.done doesn't fire)
    this.session.on('response.done', async (event: ResponseDoneEvent) => {
      try {
        const assistantText = extractAssistantText(event);
        if (!assistantText) {
          return;
        }

        if (this.config.agentType === 'transcript') {
          const text = assistantText.trim();
          if (text.length === 0) {
            return;
          }
          this.emitEvent('transcript', {
            text,
            isFinal: true,
            receivedAt: new Date().toISOString(),
          });
        } else {
          const parsedResponse = safeJsonParse<unknown>(assistantText);
          if (parsedResponse === null) {
            this.onLog?.('warn', 'Failed to parse response.done payload');
            return;
          }

          this.emitEvent('response', { raw: parsedResponse });

          if (this.config.agentType === 'cards') {
            const card = mapCardPayload(parsedResponse);
            if (card) {
              this.emitEvent('card', card);
            }
          } else {
            const factsArray = mapFactsPayload(parsedResponse);
            if (factsArray.length > 0) {
              this.emitEvent('facts', factsArray);
            }
          }
        }
      } catch (error: unknown) {
        const message = extractErrorMessage(error);
        console.error(`[realtime] Error processing response.done: ${message}`);
      } finally {
        this.pendingResponse = false;
        this.currentMessage = null;
        void this.processQueue();
      }
    });

    // Handle errors
    this.session.on('error', (error: unknown) => {
      const baseMessage = `Session error: ${extractErrorMessage(error)}`;
      const errorMessage = getLowercaseErrorField(error, 'message');

      if (errorMessage.includes('could not close the connection')) {
        console.warn(`[realtime] ${baseMessage} (ignored close failure)`);
        return;
      }

      const classification = this.classifyRealtimeError(error);

      if (classification === 'fatal') {
        console.error(`[realtime] ${baseMessage}`);
        this.onLog?.('error', baseMessage);
        this.transitionToErrorState(error, baseMessage);
        return;
      }

      console.warn(`[realtime] ${baseMessage} (transient - retrying)`);
      this.onLog?.('warn', `${baseMessage} (transient - retrying)`);

      this.isActive = false;
      this.pendingAudioBytes = 0;
      if (this.currentMessage) {
        this.messageQueue.unshift(this.currentMessage);
        this.currentMessage = null;
      }
      this.pendingResponse = false;
      this.stopPingPong();
      this.onStatusChange?.('paused');
      void this.updateDatabaseStatus('paused');
      this.safeCloseSession('Transient error - reconnecting');
      this.scheduleReconnect();
    });

    // Generic event handler for debugging
    this.session.on('event', (event: RealtimeServerEvent) => {
      // Log all events for debugging (can be removed in production)
      if (process.env.DEBUG_REALTIME) {
        console.log(`[realtime] Event: ${event.type}`, event);
      }
      
      // Handle session updates (session end is handled via close() method)
      if (event.type === 'session.updated') {
        const message = `Session updated (${this.config.agentType})`;
        console.log(`[realtime] ${message}`);
      }
    });

    // Phase 5: Event handler registration confirmation (after all handlers are registered)
    console.log(`[realtime] [${this.config.agentType}] Event handlers registered`, {
      handlersRegistered: [
        'session.created',
        'response.function_call_arguments.done',
        'response.output_text.done',
        'response.done',
        'error',
        'event',
      ],
      eventId: this.config.eventId,
    });
    this.onLog?.('log', 'Event handlers registered');
  }

  private async waitForTransportReady(timeoutMs: number = 5000): Promise<void> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    const start = Date.now();
    const { transport, socket } = getSessionInternals(this.session);

    const isOpen = (): boolean => {
      if (transport?.state) {
        return transport.state === 'open';
      }
      if (typeof transport?.readyState === 'string') {
        return transport.readyState.toLowerCase() === 'open';
      }
      if (typeof transport?.readyState === 'number') {
        return transport.readyState === 1;
      }
      if (socket?.readyState !== undefined) {
        const openConst = socket.OPEN ?? 1;
        return socket.readyState === openConst;
      }
      return false;
    };

    if (isOpen()) {
      this.onLog?.('log', 'Realtime transport already open');
      return;
    }

    this.onLog?.('log', 'Waiting for realtime transport to open');

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let pollInterval: NodeJS.Timeout | null = null;
      const removeListeners: Array<() => void> = [];

      const cleanup = () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        removeListeners.forEach((remove) => {
          try {
            remove();
          } catch (err: unknown) {
            const message = extractErrorMessage(err);
            console.warn('[realtime] Failed to remove transport listener', message);
          }
        });
        removeListeners.length = 0;
      };

      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const timeoutId = setTimeout(() => {
        rejectOnce(new Error('Timed out waiting for realtime transport to open'));
      }, timeoutMs);

      removeListeners.push(() => clearTimeout(timeoutId));

      if (transport && typeof transport.addEventListener === 'function') {
        const handleTransportOpen = () => resolveOnce();
        const handleTransportError = (event: unknown) => {
          if (isOpen()) {
            resolveOnce();
            return;
          }
          const transportError =
            (isRecord(event) && event.error instanceof Error
              ? event.error
              : new Error('Transport error before open'));
          rejectOnce(transportError);
        };
        transport.addEventListener('open', handleTransportOpen);
        transport.addEventListener('error', handleTransportError);
        removeListeners.push(() => {
          if (typeof transport.removeEventListener === 'function') {
            transport.removeEventListener('open', handleTransportOpen);
            transport.removeEventListener('error', handleTransportError);
          }
        });
      }

      if (socket) {
        if (typeof socket.on === 'function') {
          const handleSocketOpen = () => resolveOnce();
          const handleSocketError = (err: unknown) => {
            if (isOpen()) {
              resolveOnce();
              return;
            }
            rejectOnce(err instanceof Error ? err : new Error(extractErrorMessage(err)));
          };
          socket.on('open', handleSocketOpen);
          socket.on('error', handleSocketError);
          removeListeners.push(() => {
            if (typeof socket.off === 'function') {
              socket.off('open', handleSocketOpen);
              socket.off('error', handleSocketError);
            } else if (typeof socket.removeListener === 'function') {
              socket.removeListener('open', handleSocketOpen);
              socket.removeListener('error', handleSocketError);
            }
          });
        } else if (typeof socket.addEventListener === 'function') {
          const handleSocketOpen = () => resolveOnce();
          const handleSocketError = (event: unknown) => {
            if (isOpen()) {
              resolveOnce();
              return;
            }
            const socketError =
              (isRecord(event) && event.error instanceof Error
                ? event.error
                : new Error('WebSocket error before open'));
            rejectOnce(socketError);
          };
          socket.addEventListener('open', handleSocketOpen);
          socket.addEventListener('error', handleSocketError);
          removeListeners.push(() => {
            if (typeof socket.removeEventListener === 'function') {
              socket.removeEventListener('open', handleSocketOpen);
              socket.removeEventListener('error', handleSocketError);
            }
          });
        }
      }

      pollInterval = setInterval(() => {
        if (isOpen()) {
          resolveOnce();
        }
      }, 50);
    });

    const elapsed = Date.now() - start;
    this.onLog?.('log', `Realtime transport opened after ${elapsed}ms`);
  }

  /**
   * Send a message to the Realtime session
   */
  async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    if (!this.isActive || !this.session) {
      throw new Error('Session not connected');
    }

    this.messageQueue.push({ message, context });

    if (this.messageQueue.length > 1 || this.pendingResponse) {
      console.warn(`[realtime] [${this.config.agentType}] Sending message with queue backlog`, {
        queueLength: this.messageQueue.length,
        eventId: this.config.eventId,
      });
      this.onLog?.('warn', `Message queue backlog: ${this.messageQueue.length} items`);
    }

    await this.processQueue();
  }

  /**
   * Process queued messages
   */
  private async processQueue(): Promise<void> {
    if (!this.isActive || !this.session) {
      return;
    }

    if (this.pendingResponse) {
      return;
    }

    if (this.messageQueue.length === 0) {
      return;
    }

    const next = this.messageQueue.shift();
    if (!next) {
      return;
    }

    this.currentMessage = next;
    const formattedMessage = this.formatMessage(next.message, next.context);

    try {
      this.pendingResponse = true;

      this.session.send(formattedMessage as RealtimeClientEvent);

      this.session.send({
        type: 'response.create',
      } as RealtimeClientEvent);

      console.log(`[realtime] Message sent (${this.config.agentType})`);
    } catch (error: unknown) {
      this.pendingResponse = false;
      this.messageQueue.unshift(next);
      this.currentMessage = null;
      console.error(`[realtime] Error sending message: ${extractErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Format message for the agent type
   */
  private formatMessage(
    message: string,
    context?: RealtimeMessageContext
  ): ConversationItemCreateEvent {
    if (this.config.agentType === 'cards') {
      return {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: createRealtimeCardsUserPrompt(
                message,
                (context?.bullets ?? []).join('\n'),
                context?.glossaryContext ?? ''
              ),
            },
          ],
        },
      };
    } else if (this.config.agentType === 'transcript') {
      return {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: message,
            },
          ],
        },
      };
    } else {
      return {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: createRealtimeFactsUserPrompt(
                context?.recentText || message,
                JSON.stringify(context?.facts || {}, null, 2),
                context?.glossaryContext ?? ''
              ),
            },
          ],
        },
      };
    }
  }

  async appendAudioChunk(chunk: {
    audioBase64: string;
    isFinal?: boolean;
    sampleRate?: number;
    encoding?: string;
    durationMs?: number;
    speaker?: string;
  }): Promise<void> {
    if (!this.isActive || !this.session) {
      throw new Error('Transcript session not connected');
    }

    if (!chunk.audioBase64) {
      throw new Error('audioBase64 is required');
    }

    try {
      this.session.send({
        type: 'input_audio_buffer.append',
        audio: chunk.audioBase64,
      } as RealtimeClientEvent);

      this.pendingAudioBytes += Math.round((chunk.audioBase64.length * 3) / 4);

      if (chunk.isFinal) {
        this.session.send({ type: 'input_audio_buffer.commit' } as RealtimeClientEvent);
        this.session.send({
          type: 'response.create',
        } as RealtimeClientEvent);
        this.pendingAudioBytes = 0;
      }
    } catch (error: unknown) {
      console.error(`[realtime] Error appending audio chunk: ${extractErrorMessage(error)}`);
      throw error;
    }
  }

  private async sendToolResult(callId: string, output: Record<string, unknown>): Promise<void> {
    if (!this.isActive || !this.session) {
      this.onLog?.('warn', 'Skipping tool output - session inactive');
      return;
    }

    try {
      this.session.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(output),
        },
      } as RealtimeClientEvent);
    } catch (error: unknown) {
      if (isInvalidToolCallError(error)) {
        console.warn('[realtime] Ignoring tool output for expired call_id', {
          eventId: this.config.eventId,
          agentType: this.config.agentType,
          callId,
        });
        return;
      }
      throw error;
    }
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
    let websocketState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' | undefined;
    let connectionUrl: string | undefined;
    let sessionId: string | undefined;
    let connectedAt: string | undefined;
    
    // Check actual WebSocket connection state if available
    if (this.session) {
      try {
        // Get connection URL from session
        if (this.session.url) {
          connectionUrl = this.session.url.toString();
          // Extract session ID from URL if available
          const urlParts = connectionUrl.split('/');
          sessionId = urlParts[urlParts.length - 1] || undefined;
        }
        
        // OpenAIRealtimeWebSocket wraps the underlying WebSocket
        // Access the underlying socket if available
        const underlyingSocket = getUnderlyingSocket(this.session);
        if (underlyingSocket) {
          // Standard WebSocket readyState values:
          // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
          const readyState = underlyingSocket.readyState;
          if (readyState === 0) websocketState = 'CONNECTING';
          else if (readyState === 1) websocketState = 'OPEN';
          else if (readyState === 2) websocketState = 'CLOSING';
          else if (readyState === 3) websocketState = 'CLOSED';
          
          // Get connection timestamp if available
          if (readyState === 1 && (underlyingSocket).__connectedAt) {
            connectedAt = (underlyingSocket).__connectedAt;
          }
        }
      } catch (error: unknown) {
        // If we can't access the underlying socket, fall back to isActive
        websocketState = this.isActive ? 'OPEN' : 'CLOSED';
      }
    } else {
      websocketState = 'CLOSED';
    }
    
    return {
      isActive: this.isActive,
      queueLength: this.messageQueue.length,
      websocketState,
      connectionUrl,
      sessionId,
      connectedAt,
      pingPong: {
        enabled: this.pingInterval !== undefined,
        missedPongs: this.missedPongs,
        lastPongReceived: this.lastPongReceived?.toISOString(),
        pingIntervalMs: this.PING_INTERVAL_MS,
        pongTimeoutMs: this.PONG_TIMEOUT_MS,
        maxMissedPongs: this.MAX_MISSED_PONGS,
      },
    };
  }

  notifyStatus(status: 'active' | 'paused' | 'closed' | 'error', sessionId?: string): void {
    this.onStatusChange?.(status, sessionId);
  }

  /**
   * Phase 7: Log WebSocket state transitions for debugging
   */
  private logWebSocketState(operation: string, context?: Record<string, any>): void {
    try {
      const underlyingSocket = getUnderlyingSocket(this.session);
      const readyState = underlyingSocket?.readyState;
      const readyStateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
      
      console.log(`[realtime] [${this.config.agentType}] WebSocket state: ${operation}`, {
        readyState: readyState !== undefined ? `${readyState} (${readyStateNames[readyState]})` : 'unknown',
        isActive: this.isActive,
        eventId: this.config.eventId,
        ...context,
      });
    } catch (error: unknown) {
      // Ignore if we can't access state
    }
  }

  /**
   * Start ping-pong heartbeat to keep connection alive and detect disconnections
   */
  private startPingPong(): void {
    // Clear any existing ping interval
    this.stopPingPong();
    
    this.missedPongs = 0;
    this.lastPongReceived = new Date();

    // Send ping at regular intervals
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.PING_INTERVAL_MS);

    console.log(`[realtime] Ping-pong heartbeat started (interval: ${this.PING_INTERVAL_MS}ms, timeout: ${this.PONG_TIMEOUT_MS}ms) for ${this.config.agentType}`);
  }

  /**
   * Stop ping-pong heartbeat
   */
  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }
  }

  /**
   * Send ping frame to check connection health
   */
  private sendPing(): void {
    if (!this.isActive || !this.session) {
      return;
    }

    // Phase 6: Ping-pong health monitoring
    this.pingStartTime = Date.now();
    
    // Only log every 5th ping to avoid log spam (sample ~20% of pings)
    const shouldLog = this.missedPongs === 0 && Math.random() < 0.2;
    if (shouldLog) {
      console.log(`[realtime] [${this.config.agentType}] Sending ping`, {
        missedPongs: this.missedPongs,
        lastPongReceived: this.lastPongReceived?.toISOString(),
        eventId: this.config.eventId,
        timestamp: new Date().toISOString(),
      });
      this.onLog?.('log', `Ping sent (health check)`);
    }

    try {
      // Get underlying WebSocket to send ping frame
      const underlyingSocket = getUnderlyingSocket(this.session);
      if (underlyingSocket && underlyingSocket.readyState === 1 && typeof underlyingSocket.ping === 'function') {
        // Send WebSocket ping frame (not application message)
        underlyingSocket.ping();
        
        // Set timeout to wait for pong
        this.pongTimeout = setTimeout(() => {
          this.handlePongTimeout();
        }, this.PONG_TIMEOUT_MS);
      } else {
        // Ping not available - skip ping/pong (SDK may handle it internally)
        // Don't treat as error, just skip
        if (underlyingSocket && typeof underlyingSocket.ping !== 'function') {
          // Ping not supported - disable ping/pong mechanism
          this.stopPingPong();
          return;
        }
        // Socket not available or not open - connection may be dead
        console.warn(`[realtime] [${this.config.agentType}] Cannot send ping - socket not available`, {
          readyState: underlyingSocket?.readyState,
          hasSocket: !!underlyingSocket,
          eventId: this.config.eventId,
        });
        this.handlePongTimeout();
      }
    } catch (error: unknown) {
      // If ping fails, disable ping/pong mechanism
      const message = getLowercaseErrorField(error, 'message');
      if (message.includes('ping is not a function') || message.includes('underlyingsocket')) {
        console.log(`[realtime] Ping/pong not supported - disabling (${this.config.agentType})`);
        this.stopPingPong();
        return;
      }
      console.error(`[realtime] Error sending ping: ${extractErrorMessage(error)}`);
      this.handlePongTimeout();
    }
  }

  /**
   * Handle pong response (connection is alive)
   */
  private handlePong(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }
    
    // Phase 6: Ping-pong health monitoring - calculate latency
    const pongLatency = this.pingStartTime ? Date.now() - this.pingStartTime : undefined;
    this.lastPongReceived = new Date();
    this.missedPongs = 0; // Reset missed pongs counter
    
    // Log pong reception (sample ~20% to avoid log spam)
    if (pongLatency !== undefined && Math.random() < 0.2) {
      console.log(`[realtime] [${this.config.agentType}] Pong received`, {
        latency: `${pongLatency}ms`,
        missedPongsReset: true,
        eventId: this.config.eventId,
      });
      this.onLog?.('log', `Pong received (latency: ${pongLatency}ms)`);
    }
  }

  /**
   * Handle pong timeout (no response received)
   */
  private handlePongTimeout(): void {
    this.missedPongs++;
    
    console.warn(
      `[realtime] Pong timeout (${this.config.agentType}) - missed: ${this.missedPongs}/${this.MAX_MISSED_PONGS}`
    );
    this.onLog?.('warn', `Ping-pong timeout - missed ${this.missedPongs}/${this.MAX_MISSED_PONGS} pongs`);

    if (this.missedPongs >= this.MAX_MISSED_PONGS) {
      // Too many missed pongs - connection is likely dead
      console.error(
        `[realtime] Connection dead - ${this.missedPongs} missed pongs (${this.config.agentType})`
      );
      this.onLog?.('error', `Connection dead - ${this.missedPongs} missed pongs`);
      
      // Mark as inactive and trigger error status
      this.isActive = false;
      this.onStatusChange?.('error');
      this.updateDatabaseStatus('error');
      
      // Stop ping-pong
      this.stopPingPong();
      
      // Emit error event for orchestrator to handle reconnection
      this.emitEvent('error', new Error(`Connection dead - ${this.missedPongs} missed pongs`));
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
      this.stopPingPong();

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

      console.log(`[realtime] Session paused (${this.config.agentType})`);
    } catch (error: unknown) {
      console.error(`[realtime] Error pausing session: ${extractErrorMessage(error)}`);
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

      // Close WebSocket if it exists
      if (this.session) {
        this.session.close({
          code: 1000,
          reason: 'Normal closure',
        });
        this.session = undefined;
      }

      this.isActive = false;
      this.messageQueue = [];

      // Notify closed status
      this.onStatusChange?.('closed');

      // Update database
      if (this.supabase) {
        await this.updateDatabaseStatus('closed');
      }

      console.log(`[realtime] Session closed (${this.config.agentType})`);
    } catch (error: unknown) {
      console.error(`[realtime] Error closing session: ${extractErrorMessage(error)}`);
      throw error;
    }
  }
}
