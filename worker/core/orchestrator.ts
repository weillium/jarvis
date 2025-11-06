import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { RuntimeManager } from './runtime-manager';
import { EventProcessor } from './event-processor';
import { SessionManager } from '../sessions/session-manager';
import { SupabaseService, AgentSessionRecord } from '../services/supabase-service';
import { OpenAIService } from '../services/openai-service';
import { SSEService } from '../services/sse-service';
import { Logger } from '../monitoring/logger';
import { MetricsCollector } from '../monitoring/metrics-collector';
import { StatusUpdater } from '../monitoring/status-updater';
import { CheckpointManager } from '../monitoring/checkpoint-manager';
import { GlossaryManager } from '../context/glossary-manager';
import { VectorSearchService } from '../context/vector-search';
import { ModelSelectionService } from '../services/model-selection-service';
import type { AgentSessionStatus, AgentType, EventRuntime } from '../types';

export interface OrchestratorConfig {
  supabase: SupabaseClient;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  realtimeModel: string;
  sseEndpoint?: string;
  supabaseService?: SupabaseService;
  openaiService?: OpenAIService;
  sseService?: SSEService;
}

export class Orchestrator {
  private readonly config: OrchestratorConfig;
  private readonly supabaseService: SupabaseService;
  private readonly openaiService: OpenAIService;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly checkpointManager: CheckpointManager;
  private readonly glossaryManager: GlossaryManager;
  private readonly vectorSearch: VectorSearchService;
  private readonly sessionManager: SessionManager;
  private readonly runtimeManager: RuntimeManager;
  private readonly eventProcessor: EventProcessor;
  private readonly statusUpdater: StatusUpdater;
  private readonly modelSelectionService: ModelSelectionService;
  private realtimeSubscription?: { unsubscribe: () => Promise<void> };

  constructor(
    config: OrchestratorConfig,
    supabaseService: SupabaseService,
    openaiService: OpenAIService,
    logger: Logger,
    metrics: MetricsCollector,
    checkpointManager: CheckpointManager,
    glossaryManager: GlossaryManager,
    vectorSearch: VectorSearchService,
    sessionManager: SessionManager,
    runtimeManager: RuntimeManager,
    eventProcessor: EventProcessor,
    statusUpdater: StatusUpdater,
    modelSelectionService: ModelSelectionService
  ) {
    this.config = config;
    this.supabaseService = supabaseService;
    this.openaiService = openaiService;
    this.logger = logger;
    this.metrics = metrics;
    this.checkpointManager = checkpointManager;
    this.glossaryManager = glossaryManager;
    this.vectorSearch = vectorSearch;
    this.sessionManager = sessionManager;
    this.runtimeManager = runtimeManager;
    this.eventProcessor = eventProcessor;
    this.statusUpdater = statusUpdater;
    this.modelSelectionService = modelSelectionService;
  }

  async initialize(): Promise<void> {
    console.log('[orchestrator] Initializing...');

    this.realtimeSubscription = this.supabaseService.subscribeToTranscripts(({ new: record }) => {
      void this.handleTranscriptInsert(record);
    });
    console.log('[orchestrator] Subscribed to transcript events');

    const runtimes = await this.runtimeManager.resumeExistingEvents();
    for (const runtime of runtimes) {
      await this.startEvent(runtime.eventId, runtime.agentId);
    }
  }

  getRuntime(eventId: string): EventRuntime | undefined {
    return this.runtimeManager.getRuntime(eventId);
  }

  getSessionStatus(eventId: string): { transcript: AgentSessionStatus | null; cards: AgentSessionStatus | null; facts: AgentSessionStatus | null } {
    const runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      return { transcript: null, cards: null, facts: null };
    }

    const statuses = this.statusUpdater.getRuntimeStatusSnapshot(runtime);
    return {
      transcript: statuses.transcript,
      cards: statuses.cards,
      facts: statuses.facts,
    };
  }

  async createAgentSessionsForEvent(eventId: string): Promise<{
    agentId: string;
    modelSet: string;
    sessions: AgentSessionRecord[];
  }> {
    console.log(`[orchestrator] Creating agent sessions (event: ${eventId})`);

    const agent = await this.supabaseService.getAgentForEvent(
      eventId,
      ['idle'],
      ['context_complete']
    );

    if (!agent) {
      throw new Error('No agent with context_complete stage found for this event');
    }

    const agentId = agent.id;
    const modelSet = agent.model_set || 'open_ai';

    const existingSessions = await this.supabaseService.getAgentSessionsForAgent(eventId, agentId);
    if (existingSessions.length > 0) {
      console.log(
        `[orchestrator] Found ${existingSessions.length} existing session(s); deleting before recreation`
      );
      await this.supabaseService.deleteAgentSessions(eventId, agentId);
    }

    const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
    const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
    const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');

    const sessions = await this.supabaseService.insertAgentSessions([
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'transcript',
        status: 'closed',
        model: transcriptModel,
      },
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'cards',
        status: 'closed',
        model: cardsModel,
      },
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'facts',
        status: 'closed',
        model: factsModel,
      },
    ]);

    try {
      await this.supabaseService.updateAgentStatus(agentId, 'active', 'testing');
    } catch (error: any) {
      console.warn(
        `[orchestrator] Sessions created for event ${eventId} but failed to update agent status: ${error.message}`
      );
    }

    console.log(
      `[orchestrator] Created agent sessions for event ${eventId} using model_set=${modelSet}`,
      {
        transcriptModel,
        cardsModel,
        factsModel,
      }
    );

    return {
      agentId,
      modelSet,
      sessions,
    };
  }

  async startEvent(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Starting event ${eventId}`);

    let runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      runtime = await this.runtimeManager.createRuntime(eventId, agentId);
    }

    if (runtime.status === 'running') {
      if (runtime.cardsSession && runtime.factsSession) {
        console.log(`[orchestrator] Event ${eventId} already running with active sessions`);
        return;
      }

      console.log(
        `[orchestrator] Event ${eventId} marked as running but sessions missing, recreating...`
      );
      runtime.status = 'context_complete';
    }

    const existingSessions = await this.supabaseService.getAgentSessionsForAgent(eventId, agentId, [
      'closed',
      'active',
      'paused',
    ]);

    const pausedSessions = existingSessions.filter((s) => s.status === 'paused');
    if (pausedSessions.length > 0) {
      console.log(
        `[orchestrator] Event ${eventId} has ${pausedSessions.length} paused session(s), resuming...`
      );

      if (!runtime.cardsSession || !runtime.factsSession) {
        await this.createRealtimeSessions(runtime, eventId, agentId);
      }

      try {
        const { transcriptSessionId, cardsSessionId, factsSessionId } = await this.sessionManager.resumeSessions(
          runtime.transcriptSession,
          runtime.cardsSession,
          runtime.factsSession
        );
        runtime.transcriptSessionId = transcriptSessionId;
        runtime.cardsSessionId = cardsSessionId;
        runtime.factsSessionId = factsSessionId;

        this.eventProcessor.attachSessionHandlers(runtime);

        runtime.status = 'running';
        await this.supabaseService.updateAgentStatus(agentId, 'running');

        console.log(`[orchestrator] Event ${eventId} resumed successfully`);
        this.startPeriodicSummary(runtime);
        await this.statusUpdater.updateAndPushStatus(runtime);
        return;
      } catch (error: any) {
        console.error(`[orchestrator] Failed to resume sessions: ${error.message}`);
      }
    }

    const activeSessions = existingSessions.filter(
      (s) => s.status === 'active'
    );
    if (activeSessions.length > 0 && runtime.transcriptSession && runtime.cardsSession && runtime.factsSession) {
      console.log(
        `[orchestrator] Event ${eventId} already has ${activeSessions.length} active session(s)`
      );

      runtime.status = 'running';
      const currentAgent = await this.supabaseService.getAgentStatus(agentId);
      if (currentAgent && currentAgent.status !== 'testing') {
        await this.supabaseService.updateAgentStatus(agentId, 'running');
      }
      this.startPeriodicSummary(runtime);
      return;
    }

    await this.createRealtimeSessions(runtime, eventId, agentId);

    const existingSessionRecords = await this.supabaseService.getAgentSessionsForAgent(
      eventId,
      agentId
    );
    if (existingSessionRecords.length > 0) {
      // Sessions exist but are closed - update to active when we connect
      // No need to update status here, will be updated when connected
    } else {
      try {
        // Get agent's model_set to determine which models to use
        const agent = await this.supabaseService.getAgentStatus(agentId);
        const modelSet = agent?.model_set || 'open_ai';
        const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
        const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
        const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');
        
        await this.supabaseService.upsertAgentSessions([
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'transcript',
            status: 'closed', // Will be updated to 'active' when connected
            model: transcriptModel,
          },
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'cards',
            status: 'closed', // Will be updated to 'active' when connected
            model: cardsModel,
          },
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'facts',
            status: 'closed', // Will be updated to 'active' when connected
            model: factsModel,
          },
        ]);
      } catch (error: any) {
        console.error(`[orchestrator] Failed to create session records: ${error.message}`);
      }
    }

    try {
      const { transcriptSessionId, cardsSessionId, factsSessionId } = await this.sessionManager.connectSessions(
        runtime.transcriptSession!,
        runtime.cardsSession!,
        runtime.factsSession!
      );
      runtime.transcriptSessionId = transcriptSessionId;
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;
    } catch (error: any) {
      console.error(`[orchestrator] Failed to connect sessions: ${error.message}`);
      throw error;
    }

    this.eventProcessor.attachSessionHandlers(runtime);
    this.startPeriodicSummary(runtime);

    runtime.status = 'running';
    const currentAgent = await this.supabaseService.getAgentStatus(agentId);
    if (currentAgent && currentAgent.status !== 'testing') {
      await this.supabaseService.updateAgentStatus(agentId, 'running');
    }

    console.log(`[orchestrator] Event ${eventId} started`);
    await this.statusUpdater.updateAndPushStatus(runtime);
  }

  async startSessionsForTesting(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Starting sessions for testing (event: ${eventId})`);

    let runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      runtime = await this.runtimeManager.createRuntime(eventId, agentId);
      runtime.status = 'ready';
    }

    if (runtime.transcriptSession && runtime.cardsSession && runtime.factsSession && 
        runtime.transcriptSessionId && runtime.cardsSessionId && runtime.factsSessionId) {
      console.log(`[orchestrator] Sessions already connected for event ${eventId}`);
      return;
    }

    const existingSessions = await this.supabaseService.getAgentSessionsForAgent(eventId, agentId, [
      'closed',
    ]);
    if (!existingSessions.length) {
      throw new Error(
        `No closed sessions found for event ${eventId}. Create sessions first.`
      );
    }

    // Check if sessions are new (created in last minute) - if so, they're ready to start
    const newSessions = existingSessions.filter((s) => {
      if (!s.created_at) return false;
      const created = new Date(s.created_at);
      const now = new Date();
      return (now.getTime() - created.getTime()) < 60000; // Created in last minute
    });

    if (!newSessions.length) {
      throw new Error(
        `No new sessions found for event ${eventId}. Sessions may have expired.`
      );
    }

    // Get agent's model_set to determine which models to use
    const agent = await this.supabaseService.getAgentStatus(agentId);
    const modelSet = agent?.model_set || 'open_ai';
    const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
    const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
    const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');
    
    // Get API key based on model_set
    const apiKey = this.modelSelectionService.getApiKey(modelSet);
    
    const { transcriptSession, cardsSession, factsSession } = await this.sessionManager.createSessions(
      runtime,
      async (agentType, status, sessionId) => {
        console.log(
          `[orchestrator] ${agentType} session status: ${status} (${sessionId || 'no ID'})`
        );
        if (sessionId) {
          const model = agentType === 'facts' ? factsModel : (agentType === 'transcript' ? transcriptModel : cardsModel);
          await this.supabaseService.updateAgentSession(eventId, agentType, {
            status,
            provider_session_id: sessionId,
            model: model,
            updated_at: new Date().toISOString(),
          });
        }
      },
      transcriptModel,
      cardsModel,
      factsModel,
      {
        transcript: {
          onRetrieve: async () => [],
          embedText: async () => [],
          onLog: (level, message) => {
            console.log(`[transcript-test] ${message}`);
          },
        },
        cards: {
          onRetrieve: async () => [],
          embedText: async () => [],
          onLog: (level, message) => {
            console.log(`[cards-test] ${message}`);
          },
        },
        facts: {
          onRetrieve: async () => [],
          onLog: (level, message) => {
            console.log(`[facts-test] ${message}`);
          },
        },
      },
      apiKey
    );

    runtime.transcriptSession = transcriptSession;
    runtime.cardsSession = cardsSession;
    runtime.factsSession = factsSession;
    runtime.transcriptHandlerSession = undefined;
    runtime.cardsHandlerSession = undefined;
    runtime.factsHandlerSession = undefined;

    try {
      const { transcriptSessionId, cardsSessionId, factsSessionId } = await this.sessionManager.connectSessions(
        transcriptSession,
        cardsSession,
        factsSession
      );
      runtime.transcriptSessionId = transcriptSessionId;
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;
    } catch (error: any) {
      console.error(`[orchestrator] Failed to connect sessions: ${error.message}`);
      throw error;
    }

    this.eventProcessor.attachSessionHandlers(runtime);
    runtime.status = 'running';
    await this.statusUpdater.updateAndPushStatus(runtime);

    console.log(`[orchestrator] Sessions started successfully for testing (event: ${eventId})`);
  }

  async pauseEvent(eventId: string): Promise<void> {
    console.log(`[orchestrator] Pausing event ${eventId}`);
    const runtime = this.runtimeManager.getRuntime(eventId);

    if (!runtime) {
      throw new Error(`Event ${eventId} not found in runtime`);
    }

    try {
      // Record metrics before pausing (session is effectively closing)
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'transcript');
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'cards');
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'facts');
      
      await this.sessionManager.pauseSessions(runtime.transcriptSession, runtime.cardsSession, runtime.factsSession);
      console.log(`[orchestrator] Event ${eventId} paused`);
    } catch (error: any) {
      console.error(`[orchestrator] Error pausing event ${eventId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resume event (deprecated - now just calls startEvent)
   * Kept for backward compatibility with existing code that may reference it
   */
  async resumeEvent(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Resuming event ${eventId} (using unified startEvent)`);
    // Delegate to startEvent which handles both new and paused sessions
    return this.startEvent(eventId, agentId);
  }

  async shutdown(): Promise<void> {
    console.log('[orchestrator] Shutting down...');

    for (const runtime of this.runtimeManager.getAllRuntimes()) {
      this.logContextSummary(runtime);

      if (runtime.summaryTimer) {
        clearInterval(runtime.summaryTimer);
      }
      if (runtime.statusUpdateTimer) {
        clearInterval(runtime.statusUpdateTimer);
      }

      await this.checkpointManager.saveCheckpoint(runtime.eventId, 'transcript', runtime.transcriptLastSeq);
      await this.checkpointManager.saveCheckpoint(runtime.eventId, 'cards', runtime.cardsLastSeq);
      await this.checkpointManager.saveCheckpoint(runtime.eventId, 'facts', runtime.factsLastSeq);

      // Record metrics before closing sessions
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'transcript');
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'cards');
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'facts');

      this.eventProcessor.cleanup(runtime.eventId, runtime);
      await this.sessionManager.closeSessions(runtime.transcriptSession, runtime.cardsSession, runtime.factsSession);
    }

    if (this.realtimeSubscription) {
      await this.realtimeSubscription.unsubscribe();
    }

    console.log('[orchestrator] Shutdown complete');
  }

  private async handleTranscriptInsert(transcript: any): Promise<void> {
    const eventId = transcript.event_id;
    const runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      return;
    }

    await this.eventProcessor.handleTranscript(runtime, transcript);
  }

  private async createRealtimeSessions(runtime: EventRuntime, eventId: string, agentId: string): Promise<void> {
    // Get agent's model_set to determine which models to use
    const agent = await this.supabaseService.getAgentStatus(agentId);
    const modelSet = agent?.model_set || 'open_ai';
    
    // Get model configuration based on model_set
    const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
    const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
    const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');
    
    // Get API key based on model_set
    const apiKey = this.modelSelectionService.getApiKey(modelSet);
    
    const sessions = await this.sessionManager.createSessions(
      runtime,
      async (agentType, status, sessionId) => {
        await this.handleSessionStatusChange(eventId, agentId, agentType, status, sessionId);
      },
      transcriptModel,
      cardsModel,
      factsModel,
      this.getSessionCreationOptions(runtime),
      apiKey
    );

    runtime.transcriptSession = sessions.transcriptSession;
    runtime.cardsSession = sessions.cardsSession;
    runtime.factsSession = sessions.factsSession;
    runtime.transcriptHandlerSession = undefined;
    runtime.cardsHandlerSession = undefined;
    runtime.factsHandlerSession = undefined;
  }

  private async handleSessionStatusChange(
    eventId: string,
    agentId: string,
    agentType: AgentType,
    status: 'generated' | 'starting' | 'active' | 'paused' | 'closed' | 'error',
    sessionId?: string
  ): Promise<void> {
    const runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      return;
    }

    try {
      // Get current session status to track previous status for history
      const currentSessions = await this.supabaseService.getAgentSessionsForAgent(eventId, agentId, []);
      const currentSession = currentSessions.find(s => s.agent_type === agentType);
      const previousStatus = currentSession?.status;

      // Handle connection tracking when status becomes 'active'
      if (status === 'active' && sessionId) {
        try {
          // Increment connection_count and update last_connected_at
          const { connection_count, session_id } = await this.supabaseService.incrementConnectionCount(
            eventId,
            agentType
          );

          // Also update provider_session_id if provided
          if (sessionId) {
            await this.supabaseService.updateAgentSession(eventId, agentType, {
              provider_session_id: sessionId,
              status: 'active',
            });
          }

          // Log connection history
          const sessionDbId = session_id || await this.supabaseService.getAgentSessionId(eventId, agentType);
          if (sessionDbId) {
            await this.supabaseService.logAgentSessionHistory({
              agent_session_id: sessionDbId,
              event_id: eventId,
              agent_id: agentId,
              agent_type: agentType,
              event_type: previousStatus === 'paused' ? 'resumed' : 'connected',
              provider_session_id: sessionId,
              previous_status: previousStatus || undefined,
              new_status: 'active',
              connection_count,
              metadata: {
                websocket_state: agentType === 'transcript' 
                  ? runtime.transcriptSession?.getStatus()?.websocketState
                  : agentType === 'cards'
                  ? runtime.cardsSession?.getStatus()?.websocketState
                  : runtime.factsSession?.getStatus()?.websocketState,
              },
            });
          }
        } catch (error: any) {
          console.error(
            `[orchestrator] Error tracking connection for ${agentType}: ${error.message}`
          );
          // Don't throw - connection tracking failure shouldn't break the session
        }
      } else if (status !== 'active') {
        // Log other status changes (paused, error, closed, etc.)
        const sessionDbId = await this.supabaseService.getAgentSessionId(eventId, agentType);
        if (sessionDbId) {
          const eventTypeMap: Record<string, 'disconnected' | 'paused' | 'error' | 'closed'> = {
            'paused': 'paused',
            'error': 'error',
            'closed': 'closed',
          };

          const eventType = eventTypeMap[status] || 'disconnected';
          
          await this.supabaseService.logAgentSessionHistory({
            agent_session_id: sessionDbId,
            event_id: eventId,
            agent_id: agentId,
            agent_type: agentType,
            event_type: eventType,
            provider_session_id: sessionId || currentSession?.provider_session_id || undefined,
            previous_status: previousStatus || undefined,
            new_status: status,
            connection_count: currentSession?.connection_count || undefined,
            metadata: {
              websocket_state: agentType === 'transcript' 
                ? runtime.transcriptSession?.getStatus()?.websocketState
                : agentType === 'cards'
                ? runtime.cardsSession?.getStatus()?.websocketState
                : runtime.factsSession?.getStatus()?.websocketState,
            },
          });
        }
      }

      await this.statusUpdater.updateAndPushStatus(runtime);
    } catch (error: any) {
      console.error(
        `[orchestrator] Error updating session status after change: ${error.message}`
      );
    }
  }

  private getSessionCreationOptions(runtime: EventRuntime) {
    return {
      transcript: {
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
        embedText: async (text: string) => {
          return await this.openaiService.createEmbedding(text);
        },
      },
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

  private async handleRetrieveQuery(
    runtime: EventRuntime,
    query: string,
    topK: number
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    try {
      console.log(`[rag] retrieve() called: query="${query}", top_k=${topK}`);
      const results = await this.vectorSearch.search(runtime.eventId, query, topK);
      console.log(`[rag] retrieve() returned ${results.length} chunks`);
      return results;
    } catch (error: any) {
      console.error(`[rag] Error executing retrieve(): ${error.message}`);
      return [];
    }
  }

  private startPeriodicSummary(runtime: EventRuntime): void {
    if (runtime.summaryTimer) {
      clearInterval(runtime.summaryTimer);
    }
    if (runtime.statusUpdateTimer) {
      clearInterval(runtime.statusUpdateTimer);
    }

    runtime.statusUpdateTimer = setInterval(async () => {
      try {
        await this.statusUpdater.updateAndPushStatus(runtime);
      } catch (error: any) {
        console.error(`[orchestrator] Error updating session status: ${error.message}`);
      }
    }, 5000);

    runtime.summaryTimer = setInterval(() => {
      this.logContextSummary(runtime);
    }, 5 * 60 * 1000);

    setTimeout(() => {
      this.logContextSummary(runtime);
    }, 60 * 1000);
  }

  private logContextSummary(runtime: EventRuntime): void {
    const transcript = this.metrics.getMetrics(runtime.eventId, 'transcript');
    const cards = this.metrics.getMetrics(runtime.eventId, 'cards');
    const facts = this.metrics.getMetrics(runtime.eventId, 'facts');
    const ringStats = runtime.ringBuffer.getStats();
    const factsStats = runtime.factsStore.getStats();

    console.log(`\n[context] === Summary (Event: ${runtime.eventId}) ===`);
    console.log(`[context] Transcript Agent:`);
    if (transcript.count > 0) {
      console.log(`[context]   - Avg tokens: ${Math.round(transcript.total / transcript.count)}`);
      console.log(`[context]   - Max tokens: ${transcript.max}`);
      console.log(
        `[context]   - Warnings: ${transcript.warnings} (${((transcript.warnings / transcript.count) * 100).toFixed(1)}%)`
      );
      console.log(
        `[context]   - Critical: ${transcript.criticals} (${((transcript.criticals / transcript.count) * 100).toFixed(1)}%)`
      );
    }
    console.log(`[context] Cards Agent:`);
    if (cards.count > 0) {
      console.log(`[context]   - Avg tokens: ${Math.round(cards.total / cards.count)}`);
      console.log(`[context]   - Max tokens: ${cards.max}`);
      console.log(
        `[context]   - Warnings: ${cards.warnings} (${((cards.warnings / cards.count) * 100).toFixed(1)}%)`
      );
      console.log(
        `[context]   - Critical: ${cards.criticals} (${((cards.criticals / cards.count) * 100).toFixed(1)}%)`
      );
    }
    console.log(`[context] Facts Agent:`);
    if (facts.count > 0) {
      console.log(`[context]   - Avg tokens: ${Math.round(facts.total / facts.count)}`);
      console.log(`[context]   - Max tokens: ${facts.max}`);
      console.log(
        `[context]   - Warnings: ${facts.warnings} (${((facts.warnings / facts.count) * 100).toFixed(1)}%)`
      );
      console.log(
        `[context]   - Critical: ${facts.criticals} (${((facts.criticals / facts.count) * 100).toFixed(1)}%)`
      );
    }
    console.log(`[context] RingBuffer: ${ringStats.finalized} finalized chunks`);
    console.log(`[context] FactsStore: ${factsStats.capacityUsed} (${factsStats.evictions} evictions)`);
    console.log(`[context] ========================================\n`);
  }

}
