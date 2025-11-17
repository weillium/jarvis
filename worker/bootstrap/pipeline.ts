import { GlossaryManager } from '../context/glossary-manager';
import { VectorSearchService } from '../context/vector-search';
import { ContextBuilder } from '../context/context-builder';
import { CardsProcessor } from '../processing/cards-processor';
import { FactsProcessor } from '../processing/facts-processor';
import { TranscriptProcessor } from '../processing/transcript-processor';
import { SessionFactory } from '../sessions/session-factory';
import { SessionManager } from '../sessions/session-manager';
import { SessionLifecycle } from '../runtime/session-lifecycle';
import type { WorkerEnvConfig } from './env';
import type { WorkerInfrastructure } from './services';
import type { RealtimeCardType } from '../types/websocket';
import type { CardVisualRequest } from '../sessions/agent-profiles/cards/runtime-tooling/card-image-service';

interface GeneratedCardPayload {
  body?: string | null;
  image_url?: string | null;
  visual_request?: CardVisualRequest | null;
}

export const determineCardType = (
  card: GeneratedCardPayload
): RealtimeCardType => {
  const visualRequest = card.visual_request;
  if (
    visualRequest &&
    typeof visualRequest === 'object' &&
    (visualRequest.strategy === 'fetch' || visualRequest.strategy === 'generate')
  ) {
    return card.body ? 'text_visual' : 'visual';
  }

  return 'text';
};

export interface WorkerProcessingPipeline {
  glossaryManager: GlossaryManager;
  vectorSearchService: VectorSearchService;
  contextBuilder: ContextBuilder;
  cardsProcessor: CardsProcessor;
  factsProcessor: FactsProcessor;
  transcriptProcessor: TranscriptProcessor;
  sessionFactory: SessionFactory;
  sessionManager: SessionManager;
  sessionLifecycle: SessionLifecycle;
}

export const createWorkerProcessingPipeline = (
  env: WorkerEnvConfig,
  infrastructure: WorkerInfrastructure
): WorkerProcessingPipeline => {
  const glossaryManager = new GlossaryManager(infrastructure.repositories.glossary);
  const vectorSearchService = new VectorSearchService(
    infrastructure.repositories.vectorSearchGateway,
    infrastructure.openaiService
  );
  const contextBuilder = new ContextBuilder(glossaryManager);

  const cardsProcessor = new CardsProcessor(
    contextBuilder,
    infrastructure.logger,
    infrastructure.metricsCollector,
    infrastructure.checkpointManager
  );

  const factsProcessor = new FactsProcessor(
    contextBuilder,
    infrastructure.logger,
    infrastructure.metricsCollector,
    infrastructure.checkpointManager,
    infrastructure.repositories.facts
  );

  const transcriptProcessor = new TranscriptProcessor(infrastructure.repositories.transcripts);

  const sessionFactory = new SessionFactory(
    infrastructure.openai,
    infrastructure.openaiService,
    vectorSearchService,
    env.cardsModel
  );

  const sessionManager = new SessionManager(
    sessionFactory,
    infrastructure.supabaseClient,
    infrastructure.logger
  );

  const sessionLifecycle = new SessionLifecycle(
    sessionManager,
    infrastructure.repositories.agents,
    infrastructure.repositories.agentSessions,
    infrastructure.openaiService,
    vectorSearchService,
    infrastructure.modelSelectionService,
    infrastructure.statusUpdater
  );

  return {
    glossaryManager,
    vectorSearchService,
    contextBuilder,
    cardsProcessor,
    factsProcessor,
    transcriptProcessor,
    sessionFactory,
    sessionManager,
    sessionLifecycle,
  };
};
