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
import { getPolicy } from './policies';
import {
  createRealtimeCardsUserPrompt,
  createRealtimeFactsUserPrompt,
} from './prompts';

export type AgentType = 'cards' | 'facts';

export interface RealtimeSessionConfig {
  eventId: string;
  agentType: AgentType;
  model?: string;
  onStatusChange?: (
    status: 'starting' | 'active' | 'closed' | 'error',
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

export class RealtimeSession {
  private openai: OpenAI;
  private session?: OpenAIRealtimeWebSocket;
  private config: RealtimeSessionConfig;
  private isActive: boolean = false;
  private messageQueue: any[] = [];
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private onStatusChange?: (
    status: 'starting' | 'active' | 'closed' | 'error',
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

    const model = this.config.model || 'gpt-4o-realtime-preview-2024-10-01';
    const policy = getPolicy(this.config.agentType);

    // Notify starting status
    this.onStatusChange?.('starting');

    // Update database if Supabase provided
    if (this.supabase && this.config.eventId) {
      await this.updateDatabaseStatus('starting');
    }

    try {
      console.log(`[realtime] Creating session for ${this.config.agentType} agent (event: ${this.config.eventId})`);

      // Create actual WebSocket connection
      this.session = await OpenAIRealtimeWebSocket.create(this.openai, {
        model,
        dangerouslyAllowBrowser: false,
      });

      // Set up event handlers BEFORE marking as active
      this.setupEventHandlers();

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

      // Mark as active (connection established)
      this.isActive = true;

      // Get session ID from URL or generate one
      const sessionId =
        this.session.url.toString().split('/').pop() ||
        `session_${this.config.eventId}_${this.config.agentType}_${Date.now()}`;

      // Notify active status
      this.onStatusChange?.('active', sessionId);

      // Update database
      if (this.supabase) {
        await this.updateDatabaseStatus('active', sessionId);
      }

      const connectMessage = `Session connected: ${sessionId} (${this.config.agentType})`;
      console.log(`[realtime] ${connectMessage}`);
      this.onLog?.('log', connectMessage);

      return sessionId;
    } catch (error: any) {
      const errorMessage = `Connection failed: ${error.message}`;
      console.error(`[realtime] ${errorMessage}`);
      this.onLog?.('error', errorMessage);

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
    status: 'starting' | 'active' | 'closed' | 'error',
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
      console.error(
        `[realtime] Failed to update DB status: ${error.message}`
      );
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
      console.log(`[realtime] ${message}`);
      this.onLog?.('log', message);
    });

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
            console.log(`[realtime] ${logMessage}`);
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
                console.log(`[realtime] ${successMessage}`);
                this.onLog?.('log', successMessage);
              } catch (error: any) {
                const errorMessage = `Error executing retrieve(): ${error.message}`;
                console.error(`[realtime] ${errorMessage}`);
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
              console.warn(`[realtime] ${warnMessage}`);
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
            console.log(`[realtime] ${logMessage}`);
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
            console.log(`[realtime] ${successMessage}`);
            this.onLog?.('log', successMessage, { seq: args.source_seq });
          } 
          else {
            const warnMessage = `Unknown function call: ${JSON.stringify(args)}`;
            console.warn(`[realtime] ${warnMessage}`);
            this.onLog?.('warn', warnMessage);
          }
        } catch (error: any) {
          const errorMessage = `Error handling function call: ${error.message}`;
          console.error(`[realtime] ${errorMessage}`);
          this.onLog?.('error', errorMessage);
        }
      }
    );

    // Handle response text completion (for JSON responses)
    this.session.on(
      'response.output_text.done',
      async (event: ResponseTextDoneEvent) => {
        try {
          // Parse JSON response
          const response = JSON.parse(event.text);

          // Emit to registered handlers
          this.emit('response', response);

          // Process based on agent type
          if (this.config.agentType === 'cards') {
            this.emit('card', response);
          } else {
            // Facts agent expects array of facts
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
          if (textContent?.text) {
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
  getStatus(): { isActive: boolean; queueLength: number } {
    return {
      isActive: this.isActive,
      queueLength: this.messageQueue.length,
    };
  }

  /**
   * Close the session
   */
  async close(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      // Close WebSocket
      if (this.session) {
        this.session.close({
          code: 1000,
          reason: 'Normal closure',
        });
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

