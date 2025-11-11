import type http from 'http';
import { Orchestrator, type OrchestratorConfig } from '../runtime/orchestrator';
import { RuntimeManager } from '../runtime/runtime-manager';
import { EventProcessor } from '../runtime/event-processor';
import { RuntimeService } from '../runtime/runtime-service';
import { TranscriptIngestionService } from '../runtime/transcript-ingestion-service';
import { BlueprintPoller } from '../polling/blueprint-poller';
import { ContextPoller } from '../polling/context-poller';
import { RegenerationPoller } from '../polling/regeneration-poller';
import { PauseResumePoller } from '../polling/pause-resume-poller';
import { SessionStartupPoller } from '../polling/session-startup-poller';
import { createWorkerInfrastructure } from '../bootstrap/services';
import { createWorkerProcessingPipeline, determineCardType } from '../bootstrap/pipeline';
import { createWorkerServer } from './http-server';
import type { WorkerEnvConfig } from '../bootstrap/env';

export interface WorkerRuntime {
  orchestrator: Orchestrator;
  httpServer: http.Server;
  stop: () => Promise<void>;
}

const consoleLog = console.log as (...args: unknown[]) => void;

const createLog = () => (...args: unknown[]): void => {
  consoleLog(...args);
};

export const startWorker = async (env: WorkerEnvConfig): Promise<WorkerRuntime> => {
  const log = createLog();
  log('Worker/Orchestrator starting...');

  const infrastructure = createWorkerInfrastructure(env);
  const pipeline = createWorkerProcessingPipeline(env, infrastructure);

  const runtimeManager = new RuntimeManager(
    infrastructure.repositories.agents,
    infrastructure.repositories.cards,
    infrastructure.repositories.facts,
    infrastructure.repositories.transcripts,
    pipeline.glossaryManager,
    infrastructure.checkpointManager,
    infrastructure.metricsCollector,
    infrastructure.logger
  );

  const eventProcessor = new EventProcessor(
    pipeline.cardsProcessor,
    pipeline.factsProcessor,
    pipeline.transcriptProcessor,
    infrastructure.repositories.agentOutputs,
    infrastructure.repositories.cards,
    infrastructure.repositories.facts,
    determineCardType
  );

  const runtimeService = new RuntimeService(
    infrastructure.repositories.agents,
    runtimeManager,
    infrastructure.statusUpdater,
    pipeline.sessionLifecycle,
    eventProcessor
  );

  const transcriptIngestionService = new TranscriptIngestionService(
    runtimeService,
    pipeline.sessionLifecycle,
    infrastructure.repositories.transcripts,
    eventProcessor,
    infrastructure.metricsCollector,
    infrastructure.logger,
    infrastructure.statusUpdater
  );

  const orchestratorConfig: OrchestratorConfig = {
    openai: infrastructure.openai,
    embedModel: env.embedModel,
    genModel: env.contextGenModel,
    cardsModel: env.cardsModel,
    sseEndpoint: env.sseEndpoint,
  };

  const orchestrator = new Orchestrator(
    orchestratorConfig,
    infrastructure.repositories.agents,
    infrastructure.repositories.agentSessions,
    infrastructure.repositories.transcripts,
    infrastructure.logger,
    infrastructure.checkpointManager,
    pipeline.glossaryManager,
    runtimeManager,
    runtimeService,
    eventProcessor,
    infrastructure.statusUpdater,
    infrastructure.modelSelectionService,
    pipeline.sessionLifecycle,
    transcriptIngestionService
  );

  const processingAgents = new Set<string>();

  const blueprintPoller = new BlueprintPoller(
    infrastructure.supabaseClient,
    infrastructure.openai,
    env.contextGenModel,
    processingAgents,
    log
  );

  const contextPoller = new ContextPoller(
    infrastructure.supabaseClient,
    infrastructure.openai,
    env.embedModel,
    env.contextGenModel,
    env.stubResearchModel,
    env.chunksPolishModel,
    env.glossaryModel,
    env.exaApiKey,
    processingAgents,
    log
  );

  const regenerationPoller = new RegenerationPoller(
    infrastructure.supabaseClient,
    infrastructure.openai,
    env.embedModel,
    env.contextGenModel,
    env.stubResearchModel,
    env.chunksPolishModel,
    env.glossaryModel,
    env.exaApiKey,
    processingAgents,
    log
  );

  const pauseResumePoller = new PauseResumePoller(
    infrastructure.supabaseClient,
    orchestrator,
    log
  );

  const sessionStartupPoller = new SessionStartupPoller(
    infrastructure.supabaseClient,
    orchestrator,
    log
  );

  await orchestrator.initialize();

  const httpServer = createWorkerServer({
    orchestrator,
    workerPort: env.workerPort,
    log,
    supabase: infrastructure.supabaseClient,
  });

  const intervals: NodeJS.Timeout[] = [];

  const registerInterval = (runner: () => Promise<void>, intervalMs: number, label: string) => {
    const timer = setInterval(() => {
      runner().catch((err: unknown) => {
        log(`[poller:${label}] error`, String(err));
      });
    }, intervalMs);
    intervals.push(timer);
  };

  registerInterval(() => blueprintPoller.tick(), blueprintPoller.getInterval(), 'blueprint');
  registerInterval(() => contextPoller.tick(), contextPoller.getInterval(), 'context');
  registerInterval(() => regenerationPoller.tick(), regenerationPoller.getInterval(), 'regeneration');
  registerInterval(() => pauseResumePoller.tick(), pauseResumePoller.getInterval(), 'pause-resume');
  registerInterval(() => sessionStartupPoller.tick(), sessionStartupPoller.getInterval(), 'session-start');

  log('Worker/Orchestrator running...');

  const stop = async (): Promise<void> => {
    for (const timer of intervals) {
      clearInterval(timer);
    }

    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) {
          console.error('[worker-server] close error:', String(err));
        } else {
          log('[worker-server] HTTP server closed');
        }
        resolve();
      });
    });

    await orchestrator.shutdown();
  };

  return {
    orchestrator,
    httpServer,
    stop,
  };
};
