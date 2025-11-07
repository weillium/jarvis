import type OpenAI from 'openai';
import type { RuntimeManager } from './runtime-manager';
import type { EventProcessor } from './event-processor';
import type { SSEService } from '../services/sse-service';
import type { Logger } from '../monitoring/logger';
import type { MetricsCollector } from '../monitoring/metrics-collector';
import type { StatusUpdater } from '../monitoring/status-updater';
import type { CheckpointManager } from '../monitoring/checkpoint-manager';
import type { GlossaryManager } from '../context/glossary-manager';
import type { ModelSelectionService } from '../services/model-selection-service';
import type { AgentSessionStatus, AgentType, EventRuntime } from '../types';
import type { SessionLifecycle } from './session-lifecycle';
import type { RuntimeService } from './runtime-service';
import type {
  TranscriptAudioChunk,
  TranscriptIngestionService,
} from './transcript-ingestion-service';
import type { AgentSessionRecord } from '../services/supabase/types';
import type { AgentsRepository } from '../services/supabase/agents-repository';
import type { AgentSessionsRepository } from '../services/supabase/agent-sessions-repository';
import type { TranscriptsRepository } from '../services/supabase/transcripts-repository';

export interface OrchestratorConfig {
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  realtimeModel: string;
  sseEndpoint?: string;
  sseService?: SSEService;
  transcriptOnly?: boolean;
}

export class Orchestrator {
  private readonly config: OrchestratorConfig;
  private readonly agentsRepository: AgentsRepository;
  private readonly agentSessionsRepository: AgentSessionsRepository;
  private readonly transcriptsRepository: TranscriptsRepository;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly checkpointManager: CheckpointManager;
  private readonly glossaryManager: GlossaryManager;
  private readonly sessionLifecycle: SessionLifecycle;
  private readonly runtimeManager: RuntimeManager;
  private readonly runtimeService: RuntimeService;
  private readonly eventProcessor: EventProcessor;
  private readonly statusUpdater: StatusUpdater;
  private readonly modelSelectionService: ModelSelectionService;
  private readonly transcriptIngestion: TranscriptIngestionService;
  private readonly transcriptOnly: boolean;
  private realtimeSubscription?: { unsubscribe: () => Promise<void> };

  constructor(
    config: OrchestratorConfig,
    agentsRepository: AgentsRepository,
    agentSessionsRepository: AgentSessionsRepository,
    transcriptsRepository: TranscriptsRepository,
    logger: Logger,
    metrics: MetricsCollector,
    checkpointManager: CheckpointManager,
    glossaryManager: GlossaryManager,
    runtimeManager: RuntimeManager,
    runtimeService: RuntimeService,
    eventProcessor: EventProcessor,
    statusUpdater: StatusUpdater,
    modelSelectionService: ModelSelectionService,
    sessionLifecycle: SessionLifecycle,
    transcriptIngestion: TranscriptIngestionService
  ) {
    this.config = config;
    this.agentsRepository = agentsRepository;
    this.agentSessionsRepository = agentSessionsRepository;
    this.transcriptsRepository = transcriptsRepository;
    this.logger = logger;
    this.metrics = metrics;
    this.checkpointManager = checkpointManager;
    this.glossaryManager = glossaryManager;
    this.sessionLifecycle = sessionLifecycle;
    this.runtimeManager = runtimeManager;
    this.runtimeService = runtimeService;
    this.eventProcessor = eventProcessor;
    this.statusUpdater = statusUpdater;
    this.modelSelectionService = modelSelectionService;
    this.transcriptIngestion = transcriptIngestion;
    this.transcriptOnly = config.transcriptOnly ?? false;
  }

  async initialize(): Promise<void> {
    console.log('[orchestrator] Initializing...');

    this.realtimeSubscription = this.transcriptsRepository.subscribeToTranscripts(({ new: record }) => {
      void this.transcriptIngestion.handleTranscriptInsert(record);
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

  async appendTranscriptAudio(eventId: string, chunk: TranscriptAudioChunk): Promise<void> {
    if (!chunk?.audioBase64) {
      throw new Error('Audio payload is required');
    }

    console.log('[orchestrator] Received transcript audio chunk', {
      eventId,
      bytes: Math.round((chunk.audioBase64.length * 3) / 4),
      seq: chunk.seq,
      isFinal: chunk.isFinal,
      sampleRate: chunk.sampleRate,
      encoding: chunk.encoding,
    });

    const runtime = await this.transcriptIngestion.appendAudio(eventId, chunk);
    this.attachTranscriptHandler(runtime, eventId, runtime.agentId);
  }

  async createAgentSessionsForEvent(eventId: string): Promise<{
    agentId: string;
    modelSet: string;
    sessions: AgentSessionRecord[];
  }> {
    console.log(`[orchestrator] Creating agent sessions (event: ${eventId})`);

    const agent = await this.agentsRepository.getAgentForEvent(
      eventId,
      ['idle'],
      ['context_complete']
    );

    if (!agent) {
      throw new Error('No agent with context_complete stage found for this event');
    }

    const agentId = agent.id;
    const modelSet = agent.model_set || 'open_ai';

    const existingSessions = await this.agentSessionsRepository.getSessionsForAgent(eventId, agentId);
    if (existingSessions.length > 0) {
      console.log(
        `[orchestrator] Found ${existingSessions.length} existing session(s); deleting before recreation`
      );
      await this.agentSessionsRepository.deleteSessions(eventId, agentId);
    }

    const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
    const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
    const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');

    const sessions = await this.agentSessionsRepository.insertSessions([
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

    const existingSessions = await this.agentSessionsRepository.getSessionsForAgent(eventId, agentId, [
      'closed',
      'active',
      'paused',
    ]);

    const pausedSessions = existingSessions.filter((s) => s.status === 'paused');
    if (pausedSessions.length > 0) {
      console.log(
        `[orchestrator] Event ${eventId} has ${pausedSessions.length} paused session(s), resuming...`
      );

      if (
        !runtime.transcriptSession ||
        (!this.transcriptOnly && (!runtime.cardsSession || !runtime.factsSession))
      ) {
        await this.sessionLifecycle.createRealtimeSessions({
          runtime,
          eventId,
          agentId,
          transcriptOnly: this.transcriptOnly,
        });
      }

      try {
        const { transcriptSessionId, cardsSessionId, factsSessionId } =
          await this.sessionLifecycle.resumeSessions(runtime, this.transcriptOnly);
        runtime.transcriptSessionId = transcriptSessionId;
        runtime.cardsSessionId = this.transcriptOnly ? undefined : cardsSessionId;
        runtime.factsSessionId = this.transcriptOnly ? undefined : factsSessionId;

        this.attachTranscriptHandler(runtime, eventId, agentId);
        this.eventProcessor.attachSessionHandlers(runtime);

        runtime.status = 'running';
        await this.agentsRepository.updateAgentStatus(agentId, 'active', 'running');

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
    const hasRequiredSessions =
      this.transcriptOnly
        ? !!runtime.transcriptSession
        : !!runtime.transcriptSession && !!runtime.cardsSession && !!runtime.factsSession;

    if (activeSessions.length > 0 && hasRequiredSessions) {
      console.log(
        `[orchestrator] Event ${eventId} already has ${activeSessions.length} active session(s)`
      );

      runtime.status = 'running';
      const currentAgent = await this.agentsRepository.getAgentStatus(agentId);
      if (currentAgent && currentAgent.stage !== 'testing') {
        await this.agentsRepository.updateAgentStatus(agentId, 'active', 'running');
      }
      this.startPeriodicSummary(runtime);
      return;
    }

    await this.sessionLifecycle.createRealtimeSessions({
      runtime,
      eventId,
      agentId,
      transcriptOnly: this.transcriptOnly,
    });
    this.attachTranscriptHandler(runtime, eventId, agentId);

    const existingSessionRecords = await this.agentSessionsRepository.getSessionsForAgent(
      eventId,
      agentId
    );
    if (existingSessionRecords.length > 0) {
      // Sessions exist but are closed - update to active when we connect
      // No need to update status here, will be updated when connected
    } else {
      try {
        // Get agent's model_set to determine which models to use
        const agent = await this.agentsRepository.getAgentStatus(agentId);
        const modelSet = agent?.model_set || 'open_ai';
        const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
        const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
        const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');
        
        await this.agentSessionsRepository.upsertSessions([
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
      const { transcriptSessionId, cardsSessionId, factsSessionId } =
        await this.sessionLifecycle.connectSessions(runtime, eventId, this.transcriptOnly);
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
    const currentAgent = await this.agentsRepository.getAgentStatus(agentId);
    if (currentAgent && currentAgent.stage !== 'testing') {
      await this.agentsRepository.updateAgentStatus(agentId, 'active', 'running');
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

    const sessionsReady =
      this.transcriptOnly
        ? !!runtime.transcriptSession && !!runtime.transcriptSessionId
        : !!runtime.transcriptSession &&
          !!runtime.cardsSession &&
          !!runtime.factsSession &&
          !!runtime.transcriptSessionId &&
          !!runtime.cardsSessionId &&
          !!runtime.factsSessionId;

    if (sessionsReady) {
      console.log(`[orchestrator] Sessions already connected for event ${eventId}`);
      return;
    }

    const existingSessions = await this.agentSessionsRepository.getSessionsForAgent(eventId, agentId, [
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

    const sessionOptions = {
      transcript: {
        onRetrieve: async () => [],
        embedText: async () => [],
        onLog: (_level: 'log' | 'warn' | 'error', message: string) => {
          console.log(`[transcript-test] ${message}`);
        },
      },
      cards: {
        onRetrieve: async () => [],
        embedText: async () => [],
        onLog: (_level: 'log' | 'warn' | 'error', message: string) => {
          console.log(`[cards-test] ${message}`);
        },
      },
      facts: {
        onRetrieve: async () => [],
        onLog: (_level: 'log' | 'warn' | 'error', message: string) => {
          console.log(`[facts-test] ${message}`);
        },
      },
    } as const;

    await this.sessionLifecycle.createRealtimeSessions({
      runtime,
      eventId,
      agentId,
      transcriptOnly: this.transcriptOnly,
      sessionOptions,
    });
    this.attachTranscriptHandler(runtime, eventId, agentId);

    try {
      const { transcriptSessionId, cardsSessionId, factsSessionId } =
        await this.sessionLifecycle.connectSessions(runtime, eventId, this.transcriptOnly);
      runtime.transcriptSessionId = transcriptSessionId;
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;
      console.log('[orchestrator] Sessions connected', {
        transcriptSessionId,
        cardsSessionId,
        factsSessionId,
      });
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
      
      await this.sessionLifecycle.pauseSessions(runtime);
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
      await this.sessionLifecycle.closeSessions(runtime);
    }

    if (this.realtimeSubscription) {
      await this.realtimeSubscription.unsubscribe();
    }

    console.log('[orchestrator] Shutdown complete');
  }

  async resetEventRuntime(eventId: string): Promise<void> {
    await this.runtimeService.resetRuntime(eventId);
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

  private attachTranscriptHandler(runtime: EventRuntime, eventId: string, agentId: string): void {
    this.sessionLifecycle.attachTranscriptHandler(runtime, async (payload) => {
      await this.transcriptIngestion.handleRealtimeTranscript(eventId, agentId, runtime, payload);
    });
  }
}
