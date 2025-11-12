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

interface GeneratedCardPayload {
  body?: string | null;
  image_url?: string | null;
}

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
];

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

export const determineCardType = (
  card: GeneratedCardPayload,
  transcriptText: string
): RealtimeCardType => {
  if (card.image_url) {
    return card.body ? 'text_visual' : 'visual';
  }

  const lowerText = transcriptText.toLowerCase();
  const hasVisualKeyword = visualKeywords.some((keyword) => lowerText.includes(keyword));
  const isDefinition = definitionKeywords.some((keyword) => lowerText.includes(keyword));

  if (isDefinition && hasVisualKeyword) {
    return 'text_visual';
  }

  if (hasVisualKeyword && !card.body) {
    return 'visual';
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
