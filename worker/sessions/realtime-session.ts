/**
 * OpenAI Realtime API Session Manager
 * Manages WebSocket connections to OpenAI Realtime API for Cards and Facts agents
 */

import OpenAI from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type {
  RealtimeClientEvent,
  RealtimeServerEvent,
  ResponseDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { getPolicy } from '../policies';
import {
  createRealtimeCardsUserPrompt,
  createRealtimeFactsUserPrompt,
} from '../prompts';

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
  supabase?: any; // Supabase client for database updates
  // Callbacks for tool execution
  onRetrieve?: (query: string, topK: number) => Promise<Array<{ id: string; chunk: string; similarity: number }>>;
  embedText?: (text: string) => Promise<number[]>;
}

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

export class RealtimeSession {
  private openai: OpenAI;
  private session?: OpenAIRealtimeWebSocket;
  private config: RealtimeSessionConfig;
  private isActive: boolean = false;
  private messageQueue: any[] = [];
  private pendingAudioBytes: number = 0;
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private onStatusChange?: (
    status: 'active' | 'paused' | 'closed' | 'error',
    sessionId?: string
  ) => void;
  private onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ) => void;
  private supabase?: any;
  private onRetrieve?: (query: string, topK: number) => Promise<Array<{ id: string; chunk: string; similarity: number }>>;
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

  constructor(openai: OpenAI, config: RealtimeSessionConfig) {
    this.openai = openai;
    this.config = config;
    this.onStatusChange = config.onStatusChange;
    this.onLog = config.onLog;
    this.supabase = config.supabase;
    this.onRetrieve = config.onRetrieve;
    this.embedText = config.embedText;
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

      // Wait for session to be ready before sending configuration
      // The create() method returns a WebSocket, but we should wait for it to be ready
      // Use a small delay to allow the WebSocket to establish connection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Phase 3: Connection readiness check
      try {
        const underlyingSocket = (this.session as any).socket || (this.session as any).ws;
        const readyState = underlyingSocket?.readyState;
        const readyStateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        this.onLog?.('log', `Connection readyState: ${readyStateNames[readyState] || 'unknown'}`);
      } catch (error: any) {
        console.warn(`[realtime] [${this.config.agentType}] Could not check readiness: ${error.message}`);
      }

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
          },
        } as RealtimeClientEvent);
        
        this.onLog?.('log', 'Session configuration sent');
      } catch (error: any) {
        // If send fails, wait a bit and retry once
        if (error.message?.includes('could not send data') || error.message?.includes('not ready')) {
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
          } catch (retryError: any) {
            // Log but don't throw - connection might still work
            console.error(`[realtime] [${this.config.agentType}] Session update send failed after retry`, {
              error: retryError.message,
              stack: retryError.stack,
              readyState: (this.session as any)?.socket?.readyState,
              eventId: this.config.eventId,
            });
            this.onLog?.('error', `Session update failed: ${retryError.message}`);
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
        const underlyingSocket = (this.session as any).socket || (this.session as any).ws;
        if (underlyingSocket) {
          (underlyingSocket as any).__connectedAt = new Date().toISOString();
        }
      } catch (error) {
        // Ignore if we can't access underlying socket
      }

      // Start ping-pong heartbeat
      this.startPingPong();

      // Notify active status
      this.onStatusChange?.('active', sessionId);

      // Update database
      if (this.supabase) {
        await this.updateDatabaseStatus('active', sessionId);
      }

      const connectMessage = `Session connected: ${sessionId} (${this.config.agentType})`;
      this.onLog?.('log', connectMessage);

      return sessionId;
    } catch (error: any) {
      // Phase 9: Enhanced error context
      const errorContext = {
        errorType: error.constructor?.name || 'Unknown',
        message: error.message,
        stack: error.stack,
        code: error.code,
        eventId: this.config.eventId,
        agentType: this.config.agentType,
        model: this.config.model,
        isActive: this.isActive,
        readyState: (this.session as any)?.socket?.readyState,
        timestamp: new Date().toISOString(),
      };
      
      this.onLog?.('error', `Connection failed: ${error.message}`);

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
      const updateData: any = {
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
    } catch (error: any) {
      this.onLog?.('error', `Database status update failed: ${error.message}`);
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
    try {
      const underlyingSocket = (this.session as any).socket || (this.session as any).ws;
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
    } catch (error: any) {
      // If we can't access underlying socket, ping-pong may still work at SDK level
      this.onLog?.('warn', `Could not attach pong handler: ${error.message}`);
      // Disable ping/pong if we can't set it up
      this.stopPingPong();
    }

    // Handle function call arguments completion
    // When agent calls a tool, we receive the arguments and need to execute the tool
    this.session.on(
      'response.function_call_arguments.done',
      async (event: any) => {
        try {
          const args = JSON.parse(event.arguments);
          const callId = event.call_id;

          // Check if this is a retrieve() call by looking for query parameter
          if (args.query) {
            const query = args.query;
            const topK = args.top_k || 5;

            const logMessage = `retrieve() called: query="${query}", top_k=${topK}`;
            this.onLog?.('log', logMessage);

            // Execute retrieve if callback provided
            if (this.onRetrieve) {
              try {
                const results = await this.onRetrieve(query, topK);

                // Create function_call_output item to return results
                this.session!.send({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({
                      chunks: results.map((r) => ({
                        id: r.id,
                        chunk: r.chunk,
                        similarity: r.similarity,
                      })),
                    }),
                  },
                } as RealtimeClientEvent);

                const successMessage = `retrieve() returned ${results.length} chunks`;
                this.onLog?.('log', successMessage);
              } catch (error: any) {
                const errorMessage = `Error executing retrieve(): ${error.message}`;
                this.onLog?.('error', errorMessage);

                // Return error in function output
                this.session!.send({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({
                      error: error.message,
                      chunks: [],
                    }),
                  },
                } as RealtimeClientEvent);
              }
            } else {
              const warnMessage = `retrieve() called but no onRetrieve callback provided`;
              this.onLog?.('warn', warnMessage);
              
              // Return empty result
              this.session!.send({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: callId,
                  output: JSON.stringify({ chunks: [] }),
                },
              } as RealtimeClientEvent);
            }
          } 
          // Check if this is a produce_card() call (Cards agent only)
          else if (args.kind && args.card_type && args.title && args.source_seq !== undefined) {
            const logMessage = `produce_card() called: kind="${args.kind}", card_type="${args.card_type}"`;
            this.onLog?.('log', logMessage, { seq: args.source_seq });

            // Create card object from function arguments
            const card = {
              kind: args.kind,
              card_type: args.card_type,
              title: args.title,
              body: args.body || null,
              label: args.label || null,
              image_url: args.image_url || null,
              source_seq: args.source_seq,
            };

            // Emit card event to registered handlers
            this.emit('card', card);

            // Return success confirmation
            this.session!.send({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify({ success: true, card_id: `card_${Date.now()}` }),
              },
            } as RealtimeClientEvent);

            const successMessage = `produce_card() completed: ${args.kind} card`;
            this.onLog?.('log', successMessage, { seq: args.source_seq });
          } 
          else {
            const warnMessage = `Unknown function call: ${JSON.stringify(args)}`;
            this.onLog?.('warn', warnMessage);
          }
        } catch (error: any) {
          const errorMessage = `Error handling function call: ${error.message}`;
          this.onLog?.('error', errorMessage);
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

            this.emit('transcript', {
              text,
              isFinal: true,
              receivedAt: new Date().toISOString(),
            });
            return;
          }

          // Parse JSON response for cards/facts agents
          const response = JSON.parse(event.text);
          this.emit('response', response);

          if (this.config.agentType === 'cards') {
            this.emit('card', response);
          } else {
            const factsArray = Array.isArray(response)
              ? response
              : response.facts || [];
            this.emit('facts', factsArray);
          }
        } catch (error: any) {
          console.error(
            `[realtime] Error parsing response: ${error.message}`
          );
          this.emit('error', error);
        }
      }
    );

    // Handle response completion (fallback if text.done doesn't fire)
    this.session.on('response.done', async (event: ResponseDoneEvent) => {
      try {
        // Extract text from response output items
        const textItem = event.response.output?.find(
          (item: any) => item.type === 'message' && item.role === 'assistant'
        ) as any;

        // Check if it's a message item with content
        if (textItem && textItem.type === 'message' && textItem.content) {
          const textContent = textItem.content.find(
            (c: any) => c.type === 'text'
          );
          if (!textContent?.text) {
            return;
          }

          if (this.config.agentType === 'transcript') {
            const text = textContent.text.trim();
            if (text.length === 0) {
              return;
            }
            this.emit('transcript', {
              text,
              isFinal: true,
              receivedAt: new Date().toISOString(),
            });
          } else {
            const response = JSON.parse(textContent.text);
            this.emit('response', response);

            if (this.config.agentType === 'cards') {
              this.emit('card', response);
            } else {
              const factsArray = Array.isArray(response)
                ? response
                : response.facts || [];
              this.emit('facts', factsArray);
            }
          }
        }
      } catch (error: any) {
        console.error(
          `[realtime] Error processing response.done: ${error.message}`
        );
      }
    });

    // Handle errors
    this.session.on('error', (error: any) => {
      const errorMessage = `Session error: ${error.message || JSON.stringify(error)}`;
      console.error(`[realtime] ${errorMessage}`);
      this.onLog?.('error', errorMessage);
      this.isActive = false;
      this.onStatusChange?.('error');
      this.updateDatabaseStatus('error');
      this.emit('error', error);
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

  /**
   * Emit event to registered handlers
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error: any) {
          console.error(
            `[realtime] Error in event handler: ${error.message}`
          );
        }
      }
    }
  }

  /**
   * Send a message to the Realtime session
   */
  async sendMessage(message: string, context?: any): Promise<void> {
    if (!this.isActive || !this.session) {
      throw new Error('Session not connected');
    }

    // Phase 8: Message queue status logging
    if (this.messageQueue.length > 0) {
      console.warn(`[realtime] [${this.config.agentType}] Sending message with queue backlog`, {
        queueLength: this.messageQueue.length,
        eventId: this.config.eventId,
      });
      this.onLog?.('warn', `Message queue backlog: ${this.messageQueue.length} items`);
    }

    // Format message based on agent type
    const formattedMessage = this.formatMessage(message, context);

    try {
      // Step 1: Add user message to conversation
      this.session.send({
        type: 'conversation.item.create',
        item: formattedMessage.item,
      } as RealtimeClientEvent);

      // Step 2: Trigger response generation
      // Note: JSON format is specified in instructions, not response.create
      this.session.send({
        type: 'response.create',
      } as RealtimeClientEvent);

      console.log(`[realtime] Message sent (${this.config.agentType})`);

      // Process any queued messages (if connection was delayed)
      if (this.messageQueue.length > 0) {
        await this.processQueue();
      }
    } catch (error: any) {
      console.error(`[realtime] Error sending message: ${error.message}`);

      // Optionally queue for retry on connection errors
      if (
        (error as any).code === 'ECONNRESET' ||
        (error as any).code === 'TIMEOUT'
      ) {
        this.messageQueue.push(formattedMessage);
        // Schedule retry
        setTimeout(() => this.processQueue(), 1000);
      }

      throw error;
    }
  }

  /**
   * Process queued messages
   */
  private async processQueue(): Promise<void> {
    if (!this.isActive || !this.session) {
      return;
    }

    // Phase 8: Message queue processing logging
    console.log(`[realtime] [${this.config.agentType}] Processing message queue`, {
      queueLength: this.messageQueue.length,
      eventId: this.config.eventId,
    });

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      try {
        this.session.send({
          type: 'conversation.item.create',
          item: message.item,
        } as RealtimeClientEvent);
        this.session.send({
          type: 'response.create',
        } as RealtimeClientEvent);
      } catch (error: any) {
        // Re-queue if failed
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  /**
   * Format message for the agent type
   */
  private formatMessage(message: string, context?: any): any {
    if (this.config.agentType === 'cards') {
      // Cards agent: send transcript delta + context (no vector - agent uses retrieve() tool)
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
                context?.bullets || [],
                context?.glossaryContext
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
      // Facts agent: send condensed context (no vector - agent uses retrieve() tool)
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
                context?.glossaryContext
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
          response: {
            instructions: undefined,
            modalities: ['text'],
          },
        } as RealtimeClientEvent);
        this.pendingAudioBytes = 0;
      }
    } catch (error: any) {
      console.error(`[realtime] Error appending audio chunk: ${error.message}`);
      throw error;
    }
  }

  /**
   * Register event handler
   */
  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
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
        const underlyingSocket = (this.session as any).socket || (this.session as any).ws;
        if (underlyingSocket) {
          // Standard WebSocket readyState values:
          // 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED
          const readyState = underlyingSocket.readyState;
          if (readyState === 0) websocketState = 'CONNECTING';
          else if (readyState === 1) websocketState = 'OPEN';
          else if (readyState === 2) websocketState = 'CLOSING';
          else if (readyState === 3) websocketState = 'CLOSED';
          
          // Get connection timestamp if available
          if (readyState === 1 && (underlyingSocket as any).__connectedAt) {
            connectedAt = (underlyingSocket as any).__connectedAt;
          }
        }
      } catch (error) {
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
      const underlyingSocket = (this.session as any)?.socket || (this.session as any)?.ws;
      const readyState = underlyingSocket?.readyState;
      const readyStateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
      
      console.log(`[realtime] [${this.config.agentType}] WebSocket state: ${operation}`, {
        readyState: readyState !== undefined ? `${readyState} (${readyStateNames[readyState]})` : 'unknown',
        isActive: this.isActive,
        eventId: this.config.eventId,
        ...context,
      });
    } catch (error) {
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
      const underlyingSocket = (this.session as any).socket || (this.session as any).ws;
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
    } catch (error: any) {
      // If ping fails, disable ping/pong mechanism
      if (error.message?.includes('ping is not a function') || error.message?.includes('underlyingSocket')) {
        console.log(`[realtime] Ping/pong not supported - disabling (${this.config.agentType})`);
        this.stopPingPong();
        return;
      }
      console.error(`[realtime] Error sending ping: ${error.message}`);
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
      this.emit('error', new Error(`Connection dead - ${this.missedPongs} missed pongs`));
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
    } catch (error: any) {
      console.error(`[realtime] Error pausing session: ${error.message}`);
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
    } catch (error: any) {
      console.error(`[realtime] Error closing session: ${error.message}`);
      throw error;
    }
  }
}
