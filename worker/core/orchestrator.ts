import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { RuntimeManager } from './runtime-manager';
import { EventProcessor } from './event-processor';
import { SessionFactory } from '../sessions/session-factory';
import { SessionManager } from '../sessions/session-manager';
import { SupabaseService } from '../services/supabase-service';
import { OpenAIService } from '../services/openai-service';
import { SSEService } from '../services/sse-service';
import { Logger } from '../monitoring/logger';
import { MetricsCollector } from '../monitoring/metrics-collector';
import { StatusUpdater } from '../monitoring/status-updater';
import { CheckpointManager } from '../monitoring/checkpoint-manager';
import { GlossaryManager } from '../context/glossary-manager';
import { ContextBuilder } from '../context/context-builder';
import { VectorSearchService } from '../context/vector-search';
import { CardsProcessor } from '../processing/cards-processor';
import { FactsProcessor } from '../processing/facts-processor';
import { TranscriptProcessor } from '../processing/transcript-processor';
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
  private readonly sseService: SSEService;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly checkpointManager: CheckpointManager;
  private readonly glossaryManager: GlossaryManager;
  private readonly contextBuilder: ContextBuilder;
  private readonly vectorSearch: VectorSearchService;
  private readonly sessionFactory: SessionFactory;
  private readonly sessionManager: SessionManager;
  private readonly cardsProcessor: CardsProcessor;
  private readonly factsProcessor: FactsProcessor;
  private readonly transcriptProcessor: TranscriptProcessor;
  private readonly runtimeManager: RuntimeManager;
  private readonly eventProcessor: EventProcessor;
  private readonly statusUpdater: StatusUpdater;
  private realtimeSubscription?: { unsubscribe: () => Promise<void> };

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.supabaseService = config.supabaseService ?? new SupabaseService(config.supabase);
    this.openaiService =
      config.openaiService ?? new OpenAIService(config.openai, config.embedModel, config.genModel);
    this.sseService = config.sseService ?? new SSEService(config.sseEndpoint);
    this.logger = new Logger();
    this.metrics = new MetricsCollector();
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
    this.runtimeManager = new RuntimeManager(
      this.supabaseService,
      this.glossaryManager,
      this.checkpointManager,
      this.metrics,
      this.logger
    );
    this.eventProcessor = new EventProcessor(
      this.cardsProcessor,
      this.factsProcessor,
      this.transcriptProcessor,
      this.supabaseService,
      (card, transcriptText) => this.determineCardType(card, transcriptText)
    );
    this.statusUpdater = new StatusUpdater(
      this.supabaseService,
      this.sseService,
      this.logger,
      this.metrics,
      this.config.realtimeModel
    );
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

  getSessionStatus(eventId: string): { cards: AgentSessionStatus | null; facts: AgentSessionStatus | null } {
    const runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      return { cards: null, facts: null };
    }

    const statuses = this.statusUpdater.getRuntimeStatusSnapshot(runtime);
    return {
      cards: statuses.cards,
      facts: statuses.facts,
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
      'generated',
      'starting',
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
        const { cardsSessionId, factsSessionId } = await this.sessionManager.resumeSessions(
          runtime.cardsSession,
          runtime.factsSession
        );
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
      (s) => s.status === 'active' || s.status === 'starting'
    );
    if (activeSessions.length > 0 && runtime.cardsSession && runtime.factsSession) {
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
      try {
        await this.supabaseService.updateAgentSessionsStatus(eventId, agentId, ['generated'], 'starting');
      } catch (error: any) {
        console.warn(`[orchestrator] Failed to update session status: ${error.message}`);
      }
    } else {
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
      } catch (error: any) {
        console.error(`[orchestrator] Failed to create session records: ${error.message}`);
      }
    }

    try {
      const { cardsSessionId, factsSessionId } = await this.sessionManager.connectSessions(
        runtime.cardsSession!,
        runtime.factsSession!
      );
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

    if (runtime.cardsSession && runtime.factsSession && runtime.cardsSessionId && runtime.factsSessionId) {
      console.log(`[orchestrator] Sessions already connected for event ${eventId}`);
      return;
    }

    const existingSessions = await this.supabaseService.getAgentSessionsForAgent(eventId, agentId, [
      'generated',
      'starting',
    ]);
    if (!existingSessions.length) {
      throw new Error(
        `No generated or starting sessions found for event ${eventId}. Create sessions first.`
      );
    }

    try {
      await this.supabaseService.updateAgentSessionsStatus(eventId, agentId, ['generated'], 'starting');
    } catch (error: any) {
      console.warn(`[orchestrator] Failed to update session status: ${error.message}`);
    }

    const { cardsSession, factsSession } = await this.sessionManager.createSessions(
      runtime,
      async (agentType, status, sessionId) => {
        console.log(
          `[orchestrator] ${agentType} session status: ${status} (${sessionId || 'no ID'})`
        );
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
      }
    );

    runtime.cardsSession = cardsSession;
    runtime.factsSession = factsSession;
    runtime.cardsHandlerSession = undefined;
    runtime.factsHandlerSession = undefined;

    try {
      const { cardsSessionId, factsSessionId } = await this.sessionManager.connectSessions(
        cardsSession,
        factsSession
      );
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
      await this.sessionManager.pauseSessions(runtime.cardsSession, runtime.factsSession);
      console.log(`[orchestrator] Event ${eventId} paused`);
    } catch (error: any) {
      console.error(`[orchestrator] Error pausing event ${eventId}: ${error.message}`);
      throw error;
    }
  }

  async resumeEvent(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Resuming event ${eventId}`);

    let runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      runtime = await this.runtimeManager.createRuntime(eventId, agentId);
    }

    const pausedSessions = await this.supabaseService.getAgentSessionsForAgent(eventId, agentId, [
      'paused',
    ]);
    if (!pausedSessions.length) {
      throw new Error(`No paused sessions found for event ${eventId}`);
    }

    if (!runtime.cardsSession || !runtime.factsSession) {
      await this.createRealtimeSessions(runtime, eventId, agentId);
    }

    try {
      const { cardsSessionId, factsSessionId } = await this.sessionManager.resumeSessions(
        runtime.cardsSession,
        runtime.factsSession
      );
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;

      this.eventProcessor.attachSessionHandlers(runtime);

      runtime.status = 'running';
      await this.supabaseService.updateAgentStatus(agentId, 'running');

      console.log(`[orchestrator] Event ${eventId} resumed successfully`);
      this.startPeriodicSummary(runtime);
      await this.statusUpdater.updateAndPushStatus(runtime);
    } catch (error: any) {
      console.error(`[orchestrator] Error resuming event ${eventId}: ${error.message}`);
      throw error;
    }
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

      await this.checkpointManager.saveCheckpoint(runtime.eventId, runtime.agentId, 'cards', runtime.cardsLastSeq);
      await this.checkpointManager.saveCheckpoint(runtime.eventId, runtime.agentId, 'facts', runtime.factsLastSeq);

      this.eventProcessor.cleanup(runtime.eventId, runtime);
      await this.sessionManager.closeSessions(runtime.cardsSession, runtime.factsSession);
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
    const sessions = await this.sessionManager.createSessions(
      runtime,
      async (agentType, status, sessionId) => {
        await this.handleSessionStatusChange(eventId, agentId, agentType, status, sessionId);
      },
      this.getSessionCreationOptions(runtime)
    );

    runtime.cardsSession = sessions.cardsSession;
    runtime.factsSession = sessions.factsSession;
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
      await this.statusUpdater.updateAndPushStatus(runtime);
    } catch (error: any) {
      console.error(
        `[orchestrator] Error updating session status after change: ${error.message}`
      );
    }
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
    const cards = this.metrics.getMetrics(runtime.eventId, 'cards');
    const facts = this.metrics.getMetrics(runtime.eventId, 'facts');
    const ringStats = runtime.ringBuffer.getStats();
    const factsStats = runtime.factsStore.getStats();

    console.log(`\n[context] === Summary (Event: ${runtime.eventId}) ===`);
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

  private determineCardType(card: any, transcriptText: string): 'text' | 'text_visual' | 'visual' {
    if (card.image_url) {
      return card.body ? 'text_visual' : 'visual';
    }

    const lowerText = transcriptText.toLowerCase();
    const visualKeywords = [
      'photo',
      'image',
      'picture',
      'diagram',
      'chart',
      'graph',
      'map',
      'illustration',
      'visual',
      'showing',
      'depicts',
      'looks like',
      'appearance',
      'shape',
      'structure',
      'location',
      'geography',
    ];
    const hasVisualKeyword = visualKeywords.some((keyword) => lowerText.includes(keyword));

    const definitionKeywords = [
      'is',
      'are',
      'means',
      'refers to',
      'definition',
      'explain',
      'describe',
      'what is',
      'who is',
      'where is',
      'what are',
    ];
    const isDefinition = definitionKeywords.some((keyword) => lowerText.includes(keyword));

    if (isDefinition && hasVisualKeyword) {
      return 'text_visual';
    }
    if (hasVisualKeyword && !card.body) {
      return 'visual';
    }
    return 'text';
  }
}
