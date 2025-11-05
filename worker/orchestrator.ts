/**
 * Orchestrator - Manages real-time event processing with OpenAI Realtime API
 * Handles dual-agent architecture (Cards + Facts) per event
 */

import { RingBuffer } from './ring-buffer';
import { FactsStore } from './facts-store';
import { SessionFactory } from './sessions/session-factory';
import { SessionManager } from './sessions/session-manager';
import { SupabaseService } from './services/supabase-service';
import { OpenAIService } from './services/openai-service';
import { SSEService } from './services/sse-service';
import { Logger } from './monitoring/logger';
import { MetricsCollector } from './monitoring/metrics-collector';
import { StatusUpdater } from './monitoring/status-updater';
import { CheckpointManager } from './monitoring/checkpoint-manager';
import { GlossaryManager } from './context/glossary-manager';
import { ContextBuilder } from './context/context-builder';
import { VectorSearchService } from './context/vector-search';
import { CardsProcessor } from './processing/cards-processor';
import { FactsProcessor } from './processing/facts-processor';
import { TranscriptProcessor } from './processing/transcript-processor';
import type {
  AgentSessionStatus,
  AgentType,
  EventRuntime,
  GlossaryEntry,
  OrchestratorConfig,
  TranscriptChunk,
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
  private sessionFactory: SessionFactory;
  private sessionManager: SessionManager;
  private cardsProcessor: CardsProcessor;
  private factsProcessor: FactsProcessor;
  private transcriptProcessor: TranscriptProcessor;

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
    this.sessionFactory = new SessionFactory(
      this.openaiService.getClient(),
      this.openaiService,
      this.vectorSearch,
      this.config.realtimeModel
    );
    this.sessionManager = new SessionManager(this.sessionFactory, this.supabaseService, this.logger);
    this.cardsProcessor = new CardsProcessor(
      this.contextBuilder,
      this.supabaseService,
      this.openaiService,
      this.logger,
      this.metrics,
      this.checkpointManager,
      (card, transcriptText) => this.determineCardType(card, transcriptText)
    );
    this.factsProcessor = new FactsProcessor(
      this.contextBuilder,
      this.supabaseService,
      this.openaiService,
      this.logger,
      this.metrics,
      this.checkpointManager
    );
    this.transcriptProcessor = new TranscriptProcessor(this.supabaseService);
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

    const chunk = this.transcriptProcessor.convertToChunk(transcript);

    await this.processTranscriptChunk(runtime, chunk);
  }

  /**
   * Process a single transcript chunk
   */
  private async processTranscriptChunk(
    runtime: EventRuntime,
    chunk: TranscriptChunk
  ): Promise<void> {
    runtime.ringBuffer.add(chunk);

    if (!chunk.final) {
      return;
    }

    if (!chunk.seq || chunk.seq === 0) {
      await this.transcriptProcessor.ensureSequenceNumber(
        chunk.transcript_id,
        runtime.cardsLastSeq + 1
      );
      chunk.seq = runtime.cardsLastSeq + 1;
    }

    runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, chunk.seq);
    runtime.factsLastSeq = Math.max(runtime.factsLastSeq, chunk.seq);

    await this.cardsProcessor.process(
      runtime,
      chunk,
      runtime.cardsSession,
      runtime.cardsSessionId
    );

    this.scheduleFactsUpdate(runtime);
  }

  private getSessionCreationOptions(runtime: EventRuntime) {
    return {
      cards: {
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
        embedText: async (text: string) => {
          return await this.openaiService.createEmbedding(text);
        },
      },
      facts: {
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
      },
    };
  }

  private registerSessionHandlers(runtime: EventRuntime): void {
    runtime.cardsSession?.on('card', async (card: any) => {
      await this.handleCardResponse(runtime, card);
    });

    runtime.factsSession?.on('facts', async (facts: any[]) => {
      await this.handleFactsResponse(runtime, facts);
    });
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
      void this.factsProcessor.process(runtime, runtime.factsSession, runtime.factsSessionId);
    }, debounceMs);
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
      if (!runtime.cardsSession || !runtime.factsSession) {
        const sessions = await this.sessionManager.createSessions(
          runtime,
          async (agentType, status, sessionId) => {
            await this.handleSessionStatusChange(eventId, agentId, agentType, status, sessionId);
          },
          this.getSessionCreationOptions(runtime)
        );

        runtime.cardsSession = sessions.cardsSession;
        runtime.factsSession = sessions.factsSession;
      }

      try {
        const { cardsSessionId, factsSessionId } = await this.sessionManager.resumeSessions(
          runtime.cardsSession,
          runtime.factsSession
        );

        runtime.cardsSessionId = cardsSessionId;
        runtime.factsSessionId = factsSessionId;

        this.registerSessionHandlers(runtime);

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

    const sessions = await this.sessionManager.createSessions(
      runtime,
      async (agentType, status, sessionId) => {
        await this.handleSessionStatusChange(eventId, agentId, agentType, status, sessionId);
      },
      this.getSessionCreationOptions(runtime)
    );

    runtime.cardsSession = sessions.cardsSession;
    runtime.factsSession = sessions.factsSession;

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
      const { cardsSessionId, factsSessionId } = await this.sessionManager.connectSessions(
        runtime.cardsSession,
        runtime.factsSession
      );
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;
    } catch (error: any) {
      console.error(`[orchestrator] Failed to connect sessions: ${error.message}`);
      // Status will be updated to 'error' via callback
      throw error;
    }

    // Register event handlers for responses
    this.registerSessionHandlers(runtime);

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

    const sessions = await this.sessionManager.createSessions(
      runtime,
      async (agentType, status, sessionId) => {
        console.log(`[orchestrator] ${agentType} session status: ${status} (${sessionId || 'no ID'})`);
        if (sessionId) {
          await this.supabaseService.updateAgentSession(eventId, agentType, {
            status,
            provider_session_id: sessionId,
            model: this.config.realtimeModel,
            updated_at: new Date().toISOString(),
          });
        }
      },
      {
        cards: {
          onRetrieve: async () => [],
          embedText: async () => [],
          onLog: (level, message, context) => {
            console.log(`[cards-test] ${message}`);
          },
        },
        facts: {
          onRetrieve: async () => [],
          onLog: (level, message, context) => {
            console.log(`[facts-test] ${message}`);
          },
        },
      }
    );

    runtime.cardsSession = sessions.cardsSession;
    runtime.factsSession = sessions.factsSession;

    // Connect sessions (this establishes WebSocket connections)
    try {
      console.log(`[orchestrator] Connecting cards session...`);
      const { cardsSessionId, factsSessionId } = await this.sessionManager.connectSessions(
        runtime.cardsSession,
        runtime.factsSession
      );
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;
      console.log(`[orchestrator] Cards session connected: ${runtime.cardsSessionId}`);

      console.log(`[orchestrator] Connecting facts session...`);
      console.log(`[orchestrator] Facts session connected: ${runtime.factsSessionId}`);

      // Update runtime status
      runtime.status = 'running';
      this.registerSessionHandlers(runtime);
      
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
      await this.sessionManager.pauseSessions(runtime.cardsSession, runtime.factsSession);

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
      const sessions = await this.sessionManager.createSessions(
        runtime,
        async (agentType, status, sessionId) => {
          await this.handleSessionStatusChange(eventId, agentId, agentType, status, sessionId);
        },
        this.getSessionCreationOptions(runtime)
      );

      runtime.cardsSession = sessions.cardsSession;
      runtime.factsSession = sessions.factsSession;
    }

    // Resume both sessions
    try {
      const { cardsSessionId, factsSessionId } = await this.sessionManager.resumeSessions(
        runtime.cardsSession,
        runtime.factsSession
      );
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;

      // Register event handlers
      this.registerSessionHandlers(runtime);

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
      await this.sessionManager.closeSessions(runtime.cardsSession, runtime.factsSession);

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
