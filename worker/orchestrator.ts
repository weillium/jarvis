/**
 * Orchestrator - Manages real-time event processing with OpenAI Realtime API
 * Handles dual-agent architecture (Cards + Facts) per event
 */

import { RingBuffer } from './ring-buffer';
import { FactsStore } from './facts-store';
import { RealtimeSession, AgentType } from './realtime-session';
import { SupabaseService } from './services/supabase-service';
import { OpenAIService } from './services/openai-service';
import { SSEService } from './services/sse-service';
import { Logger } from './monitoring/logger';
import { MetricsCollector } from './monitoring/metrics-collector';
import { StatusUpdater } from './monitoring/status-updater';
import { CheckpointManager } from './monitoring/checkpoint-manager';
import { GlossaryManager } from './context/glossary-manager';
import { ContextBuilder, AgentContext as ContextAgentContext } from './context/context-builder';
import { VectorSearchService } from './context/vector-search';
import { getPolicy } from './policies';
import {
  createCardGenerationUserPrompt,
  FACTS_EXTRACTION_SYSTEM_PROMPT,
  createFactsExtractionUserPrompt,
} from './prompts';
import type {
  AgentSessionStatus,
  EventRuntime,
  GlossaryEntry,
  OrchestratorConfig,
  TranscriptChunk,
  Fact,
} from './types';
export type { OrchestratorConfig } from './types';

export class Orchestrator {
  private config: OrchestratorConfig;
  private runtimes: Map<string, EventRuntime> = new Map();
  private supabaseSubscription?: { unsubscribe: () => Promise<void> };
  private supabaseService: SupabaseService;
  private openaiService: OpenAIService;
  private sseService: SSEService;
  private logger: Logger;
  private metrics: MetricsCollector;
  private statusUpdater: StatusUpdater;
  private checkpointManager: CheckpointManager;
  private glossaryManager: GlossaryManager;
  private contextBuilder: ContextBuilder;
  private vectorSearch: VectorSearchService;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.supabaseService = config.supabaseService ?? new SupabaseService(config.supabase);
    this.openaiService = config.openaiService ?? new OpenAIService(config.openai, config.embedModel, config.genModel);
    this.sseService = config.sseService ?? new SSEService(config.sseEndpoint);
    this.logger = new Logger();
    this.metrics = new MetricsCollector();
    this.statusUpdater = new StatusUpdater(
      this.supabaseService,
      this.sseService,
      this.logger,
      this.metrics,
      this.config.realtimeModel
    );
    this.checkpointManager = new CheckpointManager(this.supabaseService);
    this.glossaryManager = new GlossaryManager(this.supabaseService);
    this.contextBuilder = new ContextBuilder(this.glossaryManager);
    this.vectorSearch = new VectorSearchService(this.supabaseService, this.openaiService);
  }

  /**
   * Initialize orchestrator - subscribe to transcript events
   */
  async initialize(): Promise<void> {
    console.log('[orchestrator] Initializing...');

    // Subscribe to Supabase Realtime for transcript inserts
    // This enables event-driven processing instead of polling
    this.supabaseSubscription = this.supabaseService.subscribeToTranscripts(({ new: record }) => {
      this.handleTranscriptInsert(record);
    });
    console.log('[orchestrator] Subscribed to transcript events');

    // Resume existing events (read checkpoints and rebuild state)
    await this.resumeExistingEvents();
  }

  /**
   * Get runtime for an event (for external access)
   */
  getRuntime(eventId: string): EventRuntime | undefined {
    return this.runtimes.get(eventId);
  }

  /**
   * Get current session status for an event (for external access)
   */
  getSessionStatus(eventId: string): {
    cards: AgentSessionStatus | null;
    facts: AgentSessionStatus | null;
  } {
    const runtime = this.runtimes.get(eventId);
    if (!runtime) {
      return { cards: null, facts: null };
    }

    const statuses = this.statusUpdater.getRuntimeStatusSnapshot(runtime);
    return {
      cards: statuses.cards,
      facts: statuses.facts,
    };
  }

  /**
   * Handle new transcript insert from Supabase Realtime
   */
  private async handleTranscriptInsert(transcript: any): Promise<void> {
    const eventId = transcript.event_id;
    const runtime = this.runtimes.get(eventId);

    // TEMPORARILY COMMENTED OUT FOR TESTING: Allow sessions to process regardless of runtime status
    // if (!runtime || runtime.status !== 'running') {
    //   // Event not active, skip
    //   return;
    // }
    
    // Still need runtime to exist
    if (!runtime) {
      return;
    }

    // Convert to TranscriptChunk
    const chunk: TranscriptChunk = {
      seq: transcript.seq || 0,
      at_ms: transcript.at_ms || Date.now(),
      speaker: transcript.speaker || undefined,
      text: transcript.text,
      final: transcript.final !== false, // Default to true if not specified
      transcript_id: transcript.id,
    };

    // Process the chunk
    await this.processTranscriptChunk(runtime, chunk);
  }

  /**
   * Process a single transcript chunk
   */
  private async processTranscriptChunk(
    runtime: EventRuntime,
    chunk: TranscriptChunk
  ): Promise<void> {
    // Add to ring buffer
    runtime.ringBuffer.add(chunk);

    // Only process finalized chunks
    if (!chunk.final) {
      return;
    }

    // Persist to database (already done via insert, but update seq if needed)
    if (!chunk.seq || chunk.seq === 0) {
      // Update sequence number if missing
      if (chunk.transcript_id !== undefined && chunk.transcript_id !== null) {
        await this.supabaseService.updateTranscriptSeq(
          chunk.transcript_id,
          runtime.cardsLastSeq + 1
        );
      }
      chunk.seq = runtime.cardsLastSeq + 1;
    }

    // Update checkpoints
    runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, chunk.seq);
    runtime.factsLastSeq = Math.max(runtime.factsLastSeq, chunk.seq);

    // Process with Cards Agent (immediate)
    await this.processCardsAgent(runtime, chunk);

    // Process with Facts Agent (debounced)
    this.scheduleFactsUpdate(runtime);
  }

  /**
   * Process transcript with Cards Agent
   */
  private async processCardsAgent(
    runtime: EventRuntime,
    chunk: TranscriptChunk
  ): Promise<void> {
    if (!runtime.cardsSession || !runtime.cardsSessionId) {
      this.logger.log(runtime.eventId, 'cards', 'warn', `No session for event ${runtime.eventId}`);
      return;
    }

    try {
      // Build full context for Cards agent
      const cardsContext = this.contextBuilder.buildCardsContext(runtime, chunk.text);

      const { checkBudgetStatus, formatTokenBreakdown } = await import('./utils/token-counter');
      const tokenBreakdown = this.contextBuilder.getCardsTokenBreakdown(cardsContext, chunk.text);
      
      const budgetStatus = checkBudgetStatus(tokenBreakdown.total, 2048);
      const breakdownStr = formatTokenBreakdown(tokenBreakdown.breakdown);
      
      let logLevel: 'log' | 'warn' | 'error' = 'log';
      let logPrefix = `[context]`;
      
      if (budgetStatus.critical) {
        logLevel = 'error';
        logPrefix = `[context] ⚠️ CRITICAL`;
      } else if (budgetStatus.warning) {
        logLevel = 'warn';
        logPrefix = `[context] ⚠️ WARNING`;
      }
      
      const logMessage = `${logPrefix} Cards Agent (seq ${chunk.seq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr}`;
      
      this.logger.log(runtime.eventId, 'cards', logLevel, logMessage, { seq: chunk.seq });
      
      this.metrics.recordTokens(
        runtime.eventId,
        'cards',
        tokenBreakdown.total,
        budgetStatus.warning,
        budgetStatus.critical
      );

      // Send to Realtime session
      await runtime.cardsSession.sendMessage(chunk.text, cardsContext);

      // Note: In real implementation, we'd receive the response via WebSocket
      // For now, we'll use a fallback to standard API
      await this.generateCardFallback(runtime, chunk, cardsContext);

      // Update checkpoint
      await this.persistCheckpoint(runtime.eventId, 'cards', runtime.cardsLastSeq);
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'cards', 'error', `Error processing chunk: ${error.message}`, { seq: chunk.seq });
    }
  }

  /**
   * Fallback: Generate card using standard API (until Realtime API is fully integrated)
   */
  private async generateCardFallback(
    runtime: EventRuntime,
    chunk: TranscriptChunk,
    context: ContextAgentContext
  ): Promise<void> {
    const policy = getPolicy('cards', 1);

    const userPrompt = createCardGenerationUserPrompt(
      chunk.text,
      context.bullets,
      JSON.stringify(context.facts, null, 2),
      context.glossaryContext
    );

    try {
      const response = await this.openaiService.createChatCompletion(
        [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.7,
        }
      );

      const cardJson = response.choices[0]?.message?.content;
      if (!cardJson) return;

      const card = JSON.parse(cardJson);
      card.source_seq = chunk.seq;
      
      // Validate and normalize card_type
      if (!card.card_type || !['text', 'text_visual', 'visual'].includes(card.card_type)) {
        // Auto-determine type based on content
        card.card_type = this.determineCardType(card, chunk.text);
      }
      
      // Ensure required fields based on type
      if (card.card_type === 'visual') {
        if (!card.label) card.label = card.title || 'Image';
        if (!card.body) card.body = null; // Visual cards don't need body
      } else if (card.card_type === 'text_visual') {
        if (!card.body) card.body = card.title || 'Definition';
      } else {
        // text type
        if (!card.body) card.body = card.title || 'Definition';
        card.image_url = null; // Text cards don't have images
      }

      // Store in agent_outputs
      await this.supabaseService.insertAgentOutput({
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        agent_type: 'cards',
        for_seq: chunk.seq,
        type: 'card',
        payload: card,
      });

      // Also store in legacy cards table for compatibility
      await this.supabaseService.insertCard({
        event_id: runtime.eventId,
        kind: card.kind || 'Context',
        payload: card,
      });

      this.logger.log(runtime.eventId, 'cards', 'log', `Generated card for seq ${chunk.seq} (event: ${runtime.eventId}, type: ${card.card_type})`, { seq: chunk.seq });
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'cards', 'error', `Error generating card: ${error.message}`, { seq: chunk.seq });
    }
  }

  /**
   * Determine card type based on content analysis
   */
  private determineCardType(card: any, transcriptText: string): 'text' | 'text_visual' | 'visual' {
    // Check if card has image_url
    if (card.image_url) {
      // If it has body/content, it's text_visual, otherwise visual
      return card.body ? 'text_visual' : 'visual';
    }

    // Analyze transcript for visual-worthy content
    const lowerText = transcriptText.toLowerCase();
    
    // Keywords that suggest visual content
    const visualKeywords = [
      'photo', 'image', 'picture', 'diagram', 'chart', 'graph', 'map',
      'illustration', 'visual', 'showing', 'depicts', 'looks like',
      'appearance', 'shape', 'structure', 'location', 'geography'
    ];
    
    const hasVisualKeyword = visualKeywords.some(keyword => lowerText.includes(keyword));
    
    // Check if it's a definition/explanation
    const definitionKeywords = [
      'is', 'are', 'means', 'refers to', 'definition', 'explain', 'describe',
      'what is', 'who is', 'where is', 'what are'
    ];
    
    const isDefinition = definitionKeywords.some(keyword => lowerText.includes(keyword));
    
    // Determine type
    if (isDefinition && hasVisualKeyword) {
      return 'text_visual';
    } else if (hasVisualKeyword && !card.body) {
      return 'visual';
    } else {
      return 'text';
    }
  }

  /**
   * Schedule Facts Agent update (debounced)
   */
  private scheduleFactsUpdate(runtime: EventRuntime): void {
    // Clear existing timer
    if (runtime.factsUpdateTimer) {
      clearTimeout(runtime.factsUpdateTimer);
    }

    // Schedule update (20-30 seconds debounce)
    const debounceMs = 25000; // 25 seconds
    runtime.factsUpdateTimer = setTimeout(() => {
      this.processFactsAgent(runtime);
    }, debounceMs);
  }

  /**
   * Process with Facts Agent
   */
  private async processFactsAgent(runtime: EventRuntime): Promise<void> {
    if (!runtime.factsSession || !runtime.factsSessionId) {
      this.logger.log(runtime.eventId, 'facts', 'warn', `No session for event ${runtime.eventId}`);
      return;
    }

    try {
      // Get condensed context (capped at 2048 tokens)
      const { context: factsContext, recentText } = this.contextBuilder.buildFactsContext(runtime);

      const { checkBudgetStatus, formatTokenBreakdown } = await import('./utils/token-counter');
      const tokenBreakdown = this.contextBuilder.getFactsTokenBreakdown(factsContext, recentText);

      const budgetStatus = checkBudgetStatus(tokenBreakdown.total, 2048);
      const breakdownStr = formatTokenBreakdown(tokenBreakdown.breakdown);
      
      let logLevel: 'log' | 'warn' | 'error' = 'log';
      let logPrefix = `[context]`;
      
      if (budgetStatus.critical) {
        logLevel = 'error';
        logPrefix = `[context] ⚠️ CRITICAL`;
      } else if (budgetStatus.warning) {
        logLevel = 'warn';
        logPrefix = `[context] ⚠️ WARNING`;
      }
      
      const logMessage = `${logPrefix} Facts Agent (seq ${runtime.factsLastSeq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr}`;
      
      this.logger.log(runtime.eventId, 'facts', logLevel, logMessage, { seq: runtime.factsLastSeq });
      
      this.metrics.recordTokens(
        runtime.eventId,
        'facts',
        tokenBreakdown.total,
        budgetStatus.warning,
        budgetStatus.critical
      );

      const currentFacts = runtime.factsStore.getAll();
      await runtime.factsSession.sendMessage(recentText, {
        recentText,
        facts: currentFacts,
        glossaryContext: factsContext.glossaryContext,
      });

      await this.generateFactsFallback(runtime, recentText, currentFacts, factsContext.glossaryContext);

      // Update checkpoint
      await this.persistCheckpoint(runtime.eventId, 'facts', runtime.factsLastSeq);
      runtime.factsLastUpdate = Date.now();
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'facts', 'error', `Error processing: ${error.message}`, { seq: runtime.factsLastSeq });
    }
  }

  /**
   * Fallback: Generate facts using standard API
   */
  private async generateFactsFallback(
    runtime: EventRuntime,
    recentText: string,
    currentFacts: Fact[],
    glossaryContext?: string
  ): Promise<void> {
    const policy = FACTS_EXTRACTION_SYSTEM_PROMPT;

    const userPrompt = createFactsExtractionUserPrompt(
      recentText,
      JSON.stringify(currentFacts, null, 2),
      glossaryContext
    );

    try {
      // Some models (like o1, o1-preview, o1-mini) don't support temperature parameter
      const supportsTemperature = !this.config.genModel.startsWith('o1');
      
      // Build request options - conditionally include temperature
      const requestOptions: any = {
        model: this.config.genModel,
        messages: [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      };
      
      // Only add temperature if model supports it
      if (supportsTemperature) {
        requestOptions.temperature = 0.5;
      }
      
      const response = await this.openaiService.createChatCompletion(
        [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: supportsTemperature ? 0.5 : undefined,
        }
      );

      const factsJson = response.choices[0]?.message?.content;
      if (!factsJson) return;

      const parsed = JSON.parse(factsJson);
      const newFacts = parsed.facts || [];

      // Update facts store and database
      for (const fact of newFacts) {
        if (!fact.key || !fact.value) continue;

        const confidence = fact.confidence || 0.7;
        runtime.factsStore.upsert(
          fact.key,
          fact.value,
          confidence,
          runtime.factsLastSeq,
          undefined
        );

        // Upsert to database
        await this.supabaseService.upsertFact({
          event_id: runtime.eventId,
          fact_key: fact.key,
          fact_value: fact.value,
          confidence,
          last_seen_seq: runtime.factsLastSeq,
          sources: [],
        });

        // Store in agent_outputs
        await this.supabaseService.insertAgentOutput({
          event_id: runtime.eventId,
          agent_id: runtime.agentId,
          agent_type: 'facts',
          for_seq: runtime.factsLastSeq,
          type: 'fact_update',
          payload: fact,
        });
      }

      this.logger.log(runtime.eventId, 'facts', 'log', `Updated ${newFacts.length} facts (event: ${runtime.eventId})`, { seq: runtime.factsLastSeq });
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'facts', 'error', `Error generating facts: ${error.message}`, { seq: runtime.factsLastSeq });
    }
  }

  /**
   * Start event processing (called when agent status -> running)
   */
  async startEvent(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Starting event ${eventId}`);

    // Get or create runtime
    let runtime = this.runtimes.get(eventId);
    if (!runtime) {
      runtime = await this.createRuntime(eventId, agentId);
    }

    // If already running, check if sessions exist and are active
    if (runtime.status === 'running') {
      if (runtime.cardsSession && runtime.factsSession) {
        console.log(`[orchestrator] Event ${eventId} already running with active sessions`);
        return;
      }
      // If status is running but sessions don't exist, reset status and continue
      console.log(`[orchestrator] Event ${eventId} marked as running but sessions missing, recreating...`);
      runtime.status = 'context_complete';
    }

    // Check if sessions already exist in database
    // Look for sessions with 'starting' status (activated but not yet connected)
    // Also check for 'generated' status sessions that need to be activated
    const existingSessions = await this.supabaseService.getAgentSessionsForAgent(
      eventId,
      agentId,
      ['generated', 'starting', 'active', 'paused']
    );

    // Allow starting if status is context_complete OR if we have generated/starting sessions
    // (testing workflow: sessions generated, now activating them)
    const hasGeneratedOrStartingSessions = existingSessions.some(
      s => s.status === 'generated' || s.status === 'starting'
    ) || false;

    // TEMPORARILY COMMENTED OUT FOR TESTING: Allow sessions to start regardless of runtime status
    // if (runtime.status !== 'context_complete' && !hasGeneratedOrStartingSessions) {
    //   console.warn(`[orchestrator] Event ${eventId} not ready (status: ${runtime.status}) and no generated/starting sessions`);
    //   return;
    // }

    // Handle paused sessions - resume them
    const pausedSessions = existingSessions.filter(s => s.status === 'paused');
    if (pausedSessions.length > 0) {
      console.log(`[orchestrator] Event ${eventId} has ${pausedSessions.length} paused session(s), resuming...`);
      // If runtime exists but sessions are null, recreate them
      if (!runtime.cardsSession || !runtime.factsSession) {
        // Recreate session objects (they were cleared on pause)
        runtime.cardsSession = new RealtimeSession(this.openaiService.getClient(), {
          eventId,
          agentType: 'cards',
          model: this.config.realtimeModel,
          onStatusChange: async (status, sessionId) => {
            await this.handleSessionStatusChange(eventId, agentId, 'cards', status, sessionId);
          },
          onLog: (level, message, context) => {
            this.logger.log(runtime.eventId, 'cards', level, message, context);
          },
          supabase: this.supabaseService.getClient(),
          onRetrieve: async (query: string, topK: number) => {
            return await this.handleRetrieveQuery(runtime, query, topK);
          },
          embedText: async (text: string) => {
            return await this.openaiService.createEmbedding(text);
          },
        });

        runtime.factsSession = new RealtimeSession(this.openaiService.getClient(), {
          eventId,
          agentType: 'facts',
          model: this.config.realtimeModel,
          onStatusChange: async (status, sessionId) => {
            await this.handleSessionStatusChange(eventId, agentId, 'facts', status, sessionId);
          },
          onLog: (level, message, context) => {
            this.logger.log(runtime.eventId, 'facts', level, message, context);
          },
          supabase: this.supabaseService.getClient(),
          onRetrieve: async (query: string, topK: number) => {
            return await this.handleRetrieveQuery(runtime, query, topK);
          },
        });
      }

      // Resume both sessions
      try {
        runtime.cardsSessionId = await runtime.cardsSession.resume();
        runtime.factsSessionId = await runtime.factsSession.resume();
        
        // Update runtime status
        runtime.status = 'running';
        await this.supabaseService.updateAgentStatus(agentId, 'running');

        console.log(`[orchestrator] Event ${eventId} resumed successfully`);
        await this.statusUpdater.updateAndPushStatus(runtime);
        return;
      } catch (error: any) {
        console.error(`[orchestrator] Failed to resume sessions: ${error.message}`);
        // Fall through to create new sessions
      }
    }

    // Check for active sessions (not paused or generated)
    const activeSessions = existingSessions.filter(s => s.status === 'active' || s.status === 'starting');
    if (activeSessions.length > 0) {
      console.log(`[orchestrator] Event ${eventId} already has ${activeSessions.length} active session(s) in database`);
      
      // If runtime doesn't have session objects, we need to create new connections
      // Note: OpenAI Realtime API doesn't support resuming existing sessions - each connection is new
      if (!runtime.cardsSession || !runtime.factsSession) {
        console.log(`[orchestrator] Runtime missing session objects, creating new connections...`);
        // Fall through to create new sessions (will happen below)
      } else {
        // Runtime already has session objects, just update status
        console.log(`[orchestrator] Runtime already has session objects, skipping creation`);
        runtime.status = 'running';
        // Only update agent status if it's not in 'testing' status (testing workflow)
        const currentAgentCheck = await this.supabaseService.getAgentStatus(agentId);
        if (currentAgentCheck && currentAgentCheck.status !== 'testing') {
          await this.supabaseService.updateAgentStatus(agentId, 'running');
        }
        return;
      }
    }

    // Create Realtime sessions with status callbacks and tool handlers
    runtime.cardsSession = new RealtimeSession(this.openaiService.getClient(), {
      eventId,
      agentType: 'cards',
      model: this.config.realtimeModel,
      onStatusChange: async (status, sessionId) => {
        await this.handleSessionStatusChange(eventId, agentId, 'cards', status, sessionId);
      },
      onLog: (level, message, context) => {
        this.logger.log(runtime.eventId, 'cards', level, message, context);
      },
      supabase: this.supabaseService.getClient(),
      onRetrieve: async (query: string, topK: number) => {
        return await this.handleRetrieveQuery(runtime, query, topK);
      },
      embedText: async (text: string) => {
        return await this.openaiService.createEmbedding(text);
      },
    });

    runtime.factsSession = new RealtimeSession(this.openaiService.getClient(), {
      eventId,
      agentType: 'facts',
      model: this.config.realtimeModel,
      onStatusChange: async (status, sessionId) => {
        await this.handleSessionStatusChange(eventId, agentId, 'facts', status, sessionId);
      },
      onLog: (level, message, context) => {
        this.logger.log(runtime.eventId, 'facts', level, message, context);
      },
      supabase: this.supabaseService.getClient(),
      onRetrieve: async (query: string, topK: number) => {
        return await this.handleRetrieveQuery(runtime, query, topK);
      },
      embedText: async (text: string) => {
        return await this.openaiService.createEmbedding(text);
      },
    });

    // Update existing sessions from 'generated' or 'starting' to 'starting' if needed
    // If sessions don't exist, create them (shouldn't happen in testing workflow, but handle it)
    const existingSessionRecords = await this.supabaseService.getAgentSessionsForAgent(eventId, agentId);

    if (existingSessionRecords.length > 0) {
      try {
        await this.supabaseService.updateAgentSessionsStatus(eventId, agentId, ['generated'], 'starting');
      } catch (updateError: any) {
        console.warn(`[orchestrator] Failed to update session status: ${updateError.message}`);
      }
    } else {
      // Create sessions if they don't exist (fallback - shouldn't happen in testing workflow)
      try {
        await this.supabaseService.upsertAgentSessions([
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'cards',
            status: 'starting',
          },
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'facts',
            status: 'starting',
          },
        ]);
      } catch (sessionsError: any) {
        console.error(`[orchestrator] Failed to create session records: ${sessionsError.message}`);
      }
    }

    // Connect sessions (will update status to 'active' via callback)
    try {
      runtime.cardsSessionId = await runtime.cardsSession.connect();
      runtime.factsSessionId = await runtime.factsSession.connect();
    } catch (error: any) {
      console.error(`[orchestrator] Failed to connect sessions: ${error.message}`);
      // Status will be updated to 'error' via callback
      throw error;
    }

    // Register event handlers for responses
    runtime.cardsSession.on('card', async (card: any) => {
      await this.handleCardResponse(runtime, card);
    });

    runtime.factsSession.on('facts', async (facts: any[]) => {
      await this.handleFactsResponse(runtime, facts);
    });

    // Start periodic context summary logging (every 5 minutes)
    this.startPeriodicSummary(runtime);

    // Update status to running
    runtime.status = 'running';
    // Only update agent status to 'running' if it's not already in 'testing' status
    // This allows testing workflow where agent stays in 'testing' while sessions are active
    const currentAgent = await this.supabaseService.getAgentStatus(agentId);
    if (currentAgent && currentAgent.status !== 'testing') {
      await this.supabaseService.updateAgentStatus(agentId, 'running');
    }

    console.log(`[orchestrator] Event ${eventId} started`);
    await this.statusUpdater.updateAndPushStatus(runtime);
  }

  /**
   * Start sessions for testing - minimal setup, just connects sessions
   * This is a lightweight method for testing session startup without full runtime dependencies
   */
  async startSessionsForTesting(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Starting sessions for testing (event: ${eventId})`);

    // Get or create minimal runtime (just for session storage)
    let runtime = this.runtimes.get(eventId);
    if (!runtime) {
      // Create minimal runtime without full setup
      // Load minimal glossary (empty map is fine for testing)
      const glossaryCache = await this.glossaryManager
        .loadGlossary(eventId)
        .catch(() => new Map<string, GlossaryEntry>());
      
      runtime = {
        eventId,
        agentId,
        status: 'ready', // Use 'ready' status for testing
        ringBuffer: new RingBuffer(1000, 5 * 60 * 1000), // Minimal ring buffer
        factsStore: new FactsStore(50), // Minimal facts store
        glossaryCache, // Load glossary (but empty is fine for testing)
        cardsLastSeq: 0,
        factsLastSeq: 0,
        factsLastUpdate: Date.now(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.runtimes.set(eventId, runtime);
    }

    // Check if sessions already exist and are connected
    if (runtime.cardsSession && runtime.factsSession && runtime.cardsSessionId && runtime.factsSessionId) {
      console.log(`[orchestrator] Sessions already connected for event ${eventId}`);
      return;
    }

    // Check database for existing sessions
    const existingSessions = await this.supabaseService.getAgentSessionsForAgent(
      eventId,
      agentId,
      ['generated', 'starting']
    );

    if (existingSessions.length === 0) {
      throw new Error(`No generated or starting sessions found for event ${eventId}. Create sessions first.`);
    }

    // Update sessions to 'starting' if they're 'generated'
    try {
      await this.supabaseService.updateAgentSessionsStatus(eventId, agentId, ['generated'], 'starting');
    } catch (updateError: any) {
      console.warn(`[orchestrator] Failed to update session status: ${updateError.message}`);
    }

    // Create minimal session objects with basic callbacks
    runtime.cardsSession = new RealtimeSession(this.openaiService.getClient(), {
      eventId,
      agentType: 'cards',
      model: this.config.realtimeModel,
      onStatusChange: async (status, sessionId) => {
        console.log(`[orchestrator] Cards session status: ${status} (${sessionId || 'no ID'})`);
        // Minimal status update - just update database
        if (sessionId) {
          await this.supabaseService.updateAgentSession(eventId, 'cards', {
            status,
            provider_session_id: sessionId,
            model: this.config.realtimeModel,
            updated_at: new Date().toISOString(),
          });
        }
      },
      onLog: (level, message, context) => {
        console.log(`[cards-test] ${message}`);
      },
      supabase: this.supabaseService.getClient(),
      // Minimal tool handlers - just return empty for testing
      onRetrieve: async () => [],
      embedText: async () => [],
    });

    runtime.factsSession = new RealtimeSession(this.openaiService.getClient(), {
      eventId,
      agentType: 'facts',
      model: this.config.realtimeModel,
      onStatusChange: async (status, sessionId) => {
        console.log(`[orchestrator] Facts session status: ${status} (${sessionId || 'no ID'})`);
        // Minimal status update - just update database
        if (sessionId) {
          await this.supabaseService.updateAgentSession(eventId, 'facts', {
            status,
            provider_session_id: sessionId,
            model: this.config.realtimeModel,
            updated_at: new Date().toISOString(),
          });
        }
      },
      onLog: (level, message, context) => {
        console.log(`[facts-test] ${message}`);
      },
      supabase: this.supabaseService.getClient(),
      // Minimal tool handlers - just return empty for testing
      onRetrieve: async () => [],
    });

    // Connect sessions (this establishes WebSocket connections)
    try {
      console.log(`[orchestrator] Connecting cards session...`);
      runtime.cardsSessionId = await runtime.cardsSession.connect();
      console.log(`[orchestrator] Cards session connected: ${runtime.cardsSessionId}`);

      console.log(`[orchestrator] Connecting facts session...`);
      runtime.factsSessionId = await runtime.factsSession.connect();
      console.log(`[orchestrator] Facts session connected: ${runtime.factsSessionId}`);

      // Update runtime status
      runtime.status = 'running';
      
      console.log(`[orchestrator] Sessions started successfully for testing (event: ${eventId})`);
      await this.statusUpdater.updateAndPushStatus(runtime);
    } catch (error: any) {
      console.error(`[orchestrator] Failed to connect sessions: ${error.message}`);
      // Update status to error
      if (runtime.cardsSession) {
        runtime.cardsSession.notifyStatus('error');
      }
      if (runtime.factsSession) {
        runtime.factsSession.notifyStatus('error');
      }
      throw error;
    }
  }

  /**
   * Pause event sessions (close WebSocket but preserve state)
   */
  async pauseEvent(eventId: string): Promise<void> {
    console.log(`[orchestrator] Pausing event ${eventId}`);
    const runtime = this.runtimes.get(eventId);

    if (!runtime) {
      throw new Error(`Event ${eventId} not found in runtime`);
    }

    // TEMPORARILY COMMENTED OUT FOR TESTING: Allow pause operation regardless of runtime status
    // if (runtime.status !== 'running') {
    //   throw new Error(`Event ${eventId} is not running (status: ${runtime.status})`);
    // }

    try {
      // Pause both sessions
      if (runtime.cardsSession) {
        await runtime.cardsSession.pause();
      }
      if (runtime.factsSession) {
        await runtime.factsSession.pause();
      }

      // Note: Runtime state (ring buffer, facts store) is preserved
      // Runtime status stays 'running' but sessions are paused
      // The agent status in DB is updated by the session's pause() method
      
      console.log(`[orchestrator] Event ${eventId} paused`);
    } catch (error: any) {
      console.error(`[orchestrator] Error pausing event ${eventId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resume paused event sessions
  */
  async resumeEvent(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Resuming event ${eventId}`);
    let runtime = this.runtimes.get(eventId);

    if (!runtime) {
      // Try to resume from database state
      runtime = await this.createRuntime(eventId, agentId);
    }

    // Check if sessions are paused in database
    const pausedSessions = await this.supabaseService.getAgentSessionsForAgent(
      eventId,
      agentId,
      ['paused']
    );

    if (pausedSessions.length === 0) {
      throw new Error(`No paused sessions found for event ${eventId}`);
    }

    // Recreate session objects if they don't exist
    if (!runtime.cardsSession || !runtime.factsSession) {
      runtime.cardsSession = new RealtimeSession(this.openaiService.getClient(), {
        eventId,
        agentType: 'cards',
        model: this.config.realtimeModel,
        onStatusChange: async (status, sessionId) => {
          await this.handleSessionStatusChange(eventId, agentId, 'cards', status, sessionId);
        },
        onLog: (level, message, context) => {
          this.logger.log(runtime.eventId, 'cards', level, message, context);
        },
        supabase: this.supabaseService.getClient(),
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
        embedText: async (text: string) => {
          return await this.openaiService.createEmbedding(text);
        },
      });

      runtime.factsSession = new RealtimeSession(this.openaiService.getClient(), {
        eventId,
        agentType: 'facts',
        model: this.config.realtimeModel,
        onStatusChange: async (status, sessionId) => {
          await this.handleSessionStatusChange(eventId, agentId, 'facts', status, sessionId);
        },
        onLog: (level, message, context) => {
          this.logger.log(runtime.eventId, 'facts', level, message, context);
        },
        supabase: this.supabaseService.getClient(),
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
      });
    }

    // Resume both sessions
    try {
      runtime.cardsSessionId = await runtime.cardsSession.resume();
      runtime.factsSessionId = await runtime.factsSession.resume();

      // Register event handlers
      runtime.cardsSession.on('card', async (card: any) => {
        await this.handleCardResponse(runtime, card);
      });

      runtime.factsSession.on('facts', async (facts: any[]) => {
        await this.handleFactsResponse(runtime, facts);
      });

      // Update runtime status
      runtime.status = 'running';
      await this.supabaseService.updateAgentStatus(agentId, 'running');

      console.log(`[orchestrator] Event ${eventId} resumed successfully`);
      await this.statusUpdater.updateAndPushStatus(runtime);
    } catch (error: any) {
      console.error(`[orchestrator] Error resuming event ${eventId}: ${error.message}`);
      throw error;
    }
  }


  /**
   * Create runtime for an event
   */
  private async createRuntime(
    eventId: string,
    agentId: string
  ): Promise<EventRuntime> {
    // Read checkpoints
    const checkpointValues = await this.checkpointManager.loadCheckpoints(eventId);

    // Load glossary for event
    const glossaryCache = await this.glossaryManager.loadGlossary(eventId);

    this.metrics.clear(eventId);
    this.logger.clearLogs(eventId, 'cards');
    this.logger.clearLogs(eventId, 'facts');

    const runtime: EventRuntime = {
      eventId,
      agentId,
      status: 'context_complete',
      ringBuffer: new RingBuffer(1000, 5 * 60 * 1000), // 5 minutes
      factsStore: new FactsStore(50), // Capped at 50 items with LRU eviction
      glossaryCache,
      cardsLastSeq: checkpointValues.cards,
      factsLastSeq: checkpointValues.facts,
      factsLastUpdate: Date.now(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.runtimes.set(eventId, runtime);
    return runtime;
  }

  /**
   * Resume existing events (on startup)
   */
  private async resumeExistingEvents(): Promise<void> {
    // Find events with running agents
    const agents = await this.supabaseService.getAgentsByStatus('running', 50);

    if (agents.length === 0) {
      console.log('[orchestrator] No running events to resume');
      return;
    }

    console.log(`[orchestrator] Resuming ${agents.length} events`);

    for (const agent of agents) {
      try {
        // Create runtime and rebuild state from checkpoints
        const runtime = await this.createRuntime(agent.event_id, agent.id);

        // Replay transcripts since last checkpoint
        await this.replayTranscripts(runtime);

        // Restart sessions
        await this.startEvent(agent.event_id, agent.id);
      } catch (error: any) {
        console.error(
          `[orchestrator] Error resuming event ${agent.event_id}: ${error.message}`
        );
      }
    }
  }

  /**
   * Replay transcripts to rebuild ring buffer and facts store
   */
  private async replayTranscripts(runtime: EventRuntime): Promise<void> {
    const transcripts = await this.supabaseService.getTranscriptsForReplay(
      runtime.eventId,
      Math.max(runtime.cardsLastSeq, runtime.factsLastSeq),
      1000
    );

    if (transcripts.length === 0) {
      return;
    }

    console.log(`[orchestrator] Replaying ${transcripts.length} transcripts for event ${runtime.eventId}`);

    for (const t of transcripts) {
      const chunk: TranscriptChunk = {
        seq: t.seq || 0,
        at_ms: t.at_ms || Date.now(),
        speaker: t.speaker || undefined,
        text: t.text,
        final: t.final !== false,
        transcript_id: t.id,
      };

      runtime.ringBuffer.add(chunk);
    }

    // Update checkpoints
    if (transcripts.length > 0) {
      const lastSeq = Math.max(...transcripts.map((t) => t.seq || 0));
      runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, lastSeq);
      runtime.factsLastSeq = Math.max(runtime.factsLastSeq, lastSeq);
    }
  }

  /**
   * Persist checkpoint to database
   */
  private async persistCheckpoint(
    eventId: string,
    agentType: AgentType,
    lastSeq: number
  ): Promise<void> {
    const runtime = this.runtimes.get(eventId);
    if (!runtime) return;

    await this.checkpointManager.saveCheckpoint(eventId, runtime.agentId, agentType, lastSeq);
  }


  /**
   * Helper: Search context
   */
  private async searchContext(
    eventId: string,
    query: string,
    topK: number = 5
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    try {
      return await this.vectorSearch.search(eventId, query, topK);
    } catch (error: any) {
      console.error(`[orchestrator] Context search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Handle session status changes
   */
  private async handleSessionStatusChange(
    eventId: string,
    agentId: string,
    agentType: 'cards' | 'facts',
    status: 'generated' | 'starting' | 'active' | 'paused' | 'closed' | 'error',
    sessionId?: string
  ): Promise<void> {
    console.log(
      `[orchestrator] Session status: ${agentType} -> ${status} (event: ${eventId})`
    );
    // Status is already updated in database by RealtimeSession
    
    // Update aggregated session status
    const runtime = this.runtimes.get(eventId);
    if (runtime) {
      try {
        await this.statusUpdater.updateAndPushStatus(runtime);
      } catch (error: any) {
        console.error(`[orchestrator] Error updating session status after change: ${error.message}`);
      }
    }
  }

  /**
   * Handle retrieve() tool call from agent
   * Executes vector search and returns top-K chunks
   */
  private async handleRetrieveQuery(
    runtime: EventRuntime,
    query: string,
    topK: number
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    try {
      console.log(`[rag] retrieve() called: query="${query}", top_k=${topK}`);

      // Embed query
      const results = await this.searchContext(runtime.eventId, query, topK);

      console.log(`[rag] retrieve() returned ${results.length} chunks`);
      return results;
    } catch (error: any) {
      console.error(`[rag] Error executing retrieve(): ${error.message}`);
      return [];
    }
  }

  /**
   * Handle card response from Realtime API
   */
  private async handleCardResponse(runtime: EventRuntime, card: any): Promise<void> {
    try {
      // Validate card structure
      if (!card || card === null) {
        return; // No card to emit
      }

      // Ensure required fields
      if (!card.kind || !card.title) {
        console.warn(`[cards] Invalid card structure: missing kind or title`);
        return;
      }

      // Ensure card_type is valid
      if (!card.card_type || !['text', 'text_visual', 'visual'].includes(card.card_type)) {
        // Auto-determine type (use empty string since we don't have transcript text here)
        card.card_type = this.determineCardType(card, '');
      }

      // Normalize fields based on type
      if (card.card_type === 'visual') {
        if (!card.label) card.label = card.title || 'Image';
        if (!card.body) card.body = null;
      } else if (card.card_type === 'text_visual') {
        if (!card.body) card.body = card.title || 'Definition';
      } else {
        if (!card.body) card.body = card.title || 'Definition';
        card.image_url = null;
      }

      // Store in agent_outputs
      await this.supabaseService.insertAgentOutput({
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        agent_type: 'cards',
        for_seq: card.source_seq || runtime.cardsLastSeq,
        type: 'card',
        payload: card,
      });

      // Also store in legacy cards table
      await this.supabaseService.insertCard({
        event_id: runtime.eventId,
        kind: card.kind || 'Context',
        payload: card,
      });

      console.log(
        `[cards] Card received from Realtime API (seq: ${card.source_seq || runtime.cardsLastSeq}, type: ${card.card_type})`
      );
    } catch (error: any) {
      console.error(`[cards] Error storing card: ${error.message}`);
    }
  }

  /**
   * Handle facts response from Realtime API
   */
  private async handleFactsResponse(runtime: EventRuntime, facts: any[]): Promise<void> {
    try {
      // Facts should already be an array from event handler
      if (!facts || facts.length === 0) {
        return; // No facts to update
      }

      // Update facts store and database
      for (const fact of facts) {
        if (!fact.key || fact.value === undefined) continue;

        const confidence = fact.confidence || 0.7;
        runtime.factsStore.upsert(
          fact.key,
          fact.value,
          confidence,
          runtime.factsLastSeq,
          undefined
        );

        // Upsert to database
        await this.supabaseService.upsertFact({
          event_id: runtime.eventId,
          fact_key: fact.key,
          fact_value: fact.value,
          confidence,
          last_seen_seq: runtime.factsLastSeq,
          sources: [],
        });

        await this.supabaseService.insertAgentOutput({
          event_id: runtime.eventId,
          agent_id: runtime.agentId,
          agent_type: 'facts',
          for_seq: runtime.factsLastSeq,
          type: 'fact_update',
          payload: fact,
        });
      }

      console.log(`[facts] ${facts.length} facts updated from Realtime API`);
    } catch (error: any) {
      console.error(`[facts] Error storing facts: ${error.message}`);
    }
  }

  /**
   * Graceful shutdown
   */
  /**
   * Start periodic context summary logging and status updates
   */
  private startPeriodicSummary(runtime: EventRuntime): void {
    // Clear existing timer if any
    if (runtime.summaryTimer) {
      clearInterval(runtime.summaryTimer);
    }

    // Update session status every 5 seconds
    if (runtime.statusUpdateTimer) {
      clearInterval(runtime.statusUpdateTimer);
    }
    
    runtime.statusUpdateTimer = setInterval(async () => {
      try {
        await this.statusUpdater.updateAndPushStatus(runtime);
      } catch (error: any) {
        console.error(`[orchestrator] Error updating session status: ${error.message}`);
      }
    }, 5000); // 5 seconds

    // Log summary every 5 minutes
    runtime.summaryTimer = setInterval(() => {
      this.logContextSummary(runtime);
    }, 5 * 60 * 1000); // 5 minutes

    // Log initial summary after 1 minute
    setTimeout(() => {
      this.logContextSummary(runtime);
    }, 60 * 1000); // 1 minute
  }

  /**
   * Log context usage summary
   */
  private logContextSummary(runtime: EventRuntime): void {
    const cards = this.metrics.getMetrics(runtime.eventId, 'cards');
    const facts = this.metrics.getMetrics(runtime.eventId, 'facts');
    const ringStats = runtime.ringBuffer.getStats();
    const factsStats = runtime.factsStore.getStats();

    console.log(`\n[context] === Summary (Event: ${runtime.eventId}) ===`);
    console.log(`[context] Cards Agent:`);
    if (cards.count > 0) {
      console.log(`[context]   - Avg tokens: ${Math.round(cards.total / cards.count)}`);
      console.log(`[context]   - Max tokens: ${cards.max}`);
      console.log(`[context]   - Warnings: ${cards.warnings} (${((cards.warnings / cards.count) * 100).toFixed(1)}%)`);
      console.log(`[context]   - Critical: ${cards.criticals} (${((cards.criticals / cards.count) * 100).toFixed(1)}%)`);
    }
    console.log(`[context] Facts Agent:`);
    if (facts.count > 0) {
      console.log(`[context]   - Avg tokens: ${Math.round(facts.total / facts.count)}`);
      console.log(`[context]   - Max tokens: ${facts.max}`);
      console.log(`[context]   - Warnings: ${facts.warnings} (${((facts.warnings / facts.count) * 100).toFixed(1)}%)`);
      console.log(`[context]   - Critical: ${facts.criticals} (${((facts.criticals / facts.count) * 100).toFixed(1)}%)`);
    }
    console.log(`[context] RingBuffer: ${ringStats.finalized} finalized chunks`);
    console.log(`[context] FactsStore: ${factsStats.capacityUsed} (${factsStats.evictions} evictions)`);
    console.log(`[context] ========================================\n`);
  }

  async shutdown(): Promise<void> {
    console.log('[orchestrator] Shutting down...');

    // Log final summaries and cleanup
    for (const [eventId, runtime] of this.runtimes.entries()) {
      // Log final summary
      this.logContextSummary(runtime);
      
      // Clear timers
      if (runtime.summaryTimer) {
        clearInterval(runtime.summaryTimer);
      }
      if (runtime.statusUpdateTimer) {
        clearInterval(runtime.statusUpdateTimer);
      }

      // Flush all checkpoints
      await this.persistCheckpoint(eventId, 'cards', runtime.cardsLastSeq);
      await this.persistCheckpoint(eventId, 'facts', runtime.factsLastSeq);

      // Close sessions
      if (runtime.cardsSession) {
        await runtime.cardsSession.close();
      }
      if (runtime.factsSession) {
        await runtime.factsSession.close();
      }

      this.logger.clearLogs(eventId, 'cards');
      this.logger.clearLogs(eventId, 'facts');
      this.metrics.clear(eventId);
    }

    // Unsubscribe from Realtime
    if (this.supabaseSubscription) {
      await this.supabaseSubscription.unsubscribe().catch((error: any) => {
        console.error(`[orchestrator] Error unsubscribing from Supabase channel: ${error.message}`);
      });
    }

    console.log('[orchestrator] Shutdown complete');
  }
}
