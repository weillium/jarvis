import type OpenAI from 'openai';
import type { RuntimeManager } from './runtime-manager';
import type { EventProcessor } from './event-processor';
import type { SSEService } from '../services/sse-service';
import type { Logger } from '../monitoring/logger';
import type { StatusUpdater } from '../monitoring/status-updater';
import type { CheckpointManager } from '../monitoring/checkpoint-manager';
import type { GlossaryManager } from '../context/glossary-manager';
import type { ModelSelectionService } from '../services/model-selection-service';
import type { AgentSessionStatus, EventRuntime } from '../types';
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
import { SessionCoordinator } from './orchestrator/session-coordinator';
import { TranscriptCoordinator } from './orchestrator/transcript-coordinator';
import { OrchestratorStatusService } from './orchestrator/status-service';

export interface OrchestratorConfig {
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  cardsModel: string;
  sseEndpoint?: string;
  sseService?: SSEService;
}

export class Orchestrator {
  private readonly config: OrchestratorConfig;
  private readonly transcriptsRepository: TranscriptsRepository;
  private readonly logger: Logger;
  private readonly checkpointManager: CheckpointManager;
  private readonly glossaryManager: GlossaryManager;
  private readonly sessionLifecycle: SessionLifecycle;
  private readonly runtimeManager: RuntimeManager;
  private readonly runtimeService: RuntimeService;
  private readonly eventProcessor: EventProcessor;
  private readonly statusUpdater: StatusUpdater;
  private readonly transcriptIngestion: TranscriptIngestionService;
  private readonly sessionCoordinator: SessionCoordinator;
  private readonly transcriptCoordinator: TranscriptCoordinator;
  private readonly statusService: OrchestratorStatusService;
  private realtimeSubscription?: { unsubscribe: () => Promise<void> };

  constructor(
    config: OrchestratorConfig,
    agentsRepository: AgentsRepository,
    agentSessionsRepository: AgentSessionsRepository,
    transcriptsRepository: TranscriptsRepository,
    logger: Logger,
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
    this.transcriptsRepository = transcriptsRepository;
    this.logger = logger;
    this.checkpointManager = checkpointManager;
    this.glossaryManager = glossaryManager;
    this.sessionLifecycle = sessionLifecycle;
    this.runtimeManager = runtimeManager;
    this.runtimeService = runtimeService;
    this.eventProcessor = eventProcessor;
    this.statusUpdater = statusUpdater;
    this.transcriptIngestion = transcriptIngestion;
    this.transcriptCoordinator = new TranscriptCoordinator(transcriptIngestion, sessionLifecycle);
    this.statusService = new OrchestratorStatusService(runtimeManager, statusUpdater);
    this.sessionCoordinator = new SessionCoordinator({
      runtimeManager,
      sessionLifecycle,
      agentSessionsRepository,
      agentsRepository,
      modelSelectionService,
      eventProcessor,
      statusUpdater,
      log: (...args: unknown[]) => {
        console.log(...args);
      },
      attachTranscriptHandler: (runtime, eventId, agentId) => {
        this.transcriptCoordinator.attachTranscriptHandler(runtime, eventId, agentId);
      },
      startPeriodicSummary: (runtime) => {
        this.startPeriodicSummary(runtime);
      },
    });
  }

  async initialize(): Promise<void> {
    console.log('[orchestrator] Initializing...');

    this.realtimeSubscription = this.transcriptsRepository.subscribeToTranscripts(({ new: record }) => {
      void this.transcriptIngestion.handleTranscriptInsert(record);
    });
    console.log('[orchestrator] Subscribed to transcript events');

    const runtimes = await this.runtimeManager.resumeExistingEvents();
    for (const runtime of runtimes) {
      await this.sessionCoordinator.startEvent(runtime.eventId, runtime.agentId);
    }
  }

  getRuntime(eventId: string): EventRuntime | undefined {
    return this.statusService.getRuntime(eventId);
  }

  getSessionStatus(eventId: string): {
    transcript: AgentSessionStatus | null;
    cards: AgentSessionStatus | null;
    facts: AgentSessionStatus | null;
  } {
    return this.statusService.getSessionStatus(eventId);
  }

  async appendTranscriptAudio(eventId: string, chunk: TranscriptAudioChunk): Promise<void> {
    if (!chunk?.audioBase64) {
      throw new Error('Audio payload is required');
    }

    await this.transcriptCoordinator.appendTranscriptAudio(eventId, chunk);
  }

  async createAgentSessionsForEvent(eventId: string): Promise<{
    agentId: string;
    modelSet: string;
    sessions: AgentSessionRecord[];
  }> {
    return this.sessionCoordinator.createAgentSessionsForEvent(eventId);
  }

  async startEvent(eventId: string, agentId: string): Promise<void> {
    await this.sessionCoordinator.startEvent(eventId, agentId);
  }

  async startSessionsForTesting(eventId: string, agentId: string): Promise<void> {
    await this.sessionCoordinator.startSessionsForTesting(eventId, agentId);
  }

  async pauseEvent(eventId: string): Promise<void> {
    await this.sessionCoordinator.pauseEvent(eventId);
  }

  async resumeEvent(eventId: string, agentId: string): Promise<void> {
    await this.sessionCoordinator.resumeEvent(eventId, agentId);
  }

  async shutdown(): Promise<void> {
    console.log('[orchestrator] Shutting down...');

    for (const runtime of this.runtimeManager.getAllRuntimes()) {
      if (runtime.summaryTimer) {
        clearInterval(runtime.summaryTimer);
      }
      if (runtime.statusUpdateTimer) {
        clearInterval(runtime.statusUpdateTimer);
      }

      await this.checkpointManager.saveCheckpoint(runtime.eventId, 'transcript', runtime.transcriptLastSeq);
      await this.checkpointManager.saveCheckpoint(runtime.eventId, 'cards', runtime.cardsLastSeq);
      await this.checkpointManager.saveCheckpoint(runtime.eventId, 'facts', runtime.factsLastSeq);

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
      runtime.summaryTimer = undefined;
    }
    if (runtime.statusUpdateTimer) {
      clearInterval(runtime.statusUpdateTimer);
    }

    runtime.statusUpdateTimer = setInterval(() => {
      this.statusUpdater.updateAndPushStatus(runtime).catch((err: unknown) => {
        console.error("[worker] error:", String(err));
      });
    }, 5000);

    runtime.summaryTimer = undefined;
  }
}

