import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ModelSelectionService } from '../services/model-selection-service';
import { OpenAIService } from '../services/openai-service';
import { SSEService } from '../services/sse-service';
import { Logger } from '../services/observability/logger';
import { MetricsCollector } from '../services/observability/metrics-collector';
import { StatusUpdater } from '../services/observability/status-updater';
import { CheckpointManager } from '../services/observability/checkpoint-manager';
import {
  createSupabaseClient,
  AgentsRepository,
  AgentSessionsRepository,
  AgentOutputsRepository,
  CardsRepository,
  CheckpointsRepository,
  FactsRepository,
  GlossaryRepository,
  TranscriptsRepository,
  VectorSearchGateway,
  ContextBlueprintRepository,
} from '../services/supabase';
import { CardImageService } from '../sessions/agent-profiles/cards/runtime-tooling/card-image-service';
import type { WorkerEnvConfig } from './env';
import { Exa } from 'exa-js';
import type { ImageFetchProvider } from '../sessions/agent-profiles/cards/runtime-tooling/image-fetcher';

export interface WorkerRepositories {
  agents: AgentsRepository;
  agentSessions: AgentSessionsRepository;
  checkpoints: CheckpointsRepository;
  transcripts: TranscriptsRepository;
  glossary: GlossaryRepository;
  agentOutputs: AgentOutputsRepository;
  cards: CardsRepository;
  facts: FactsRepository;
  vectorSearchGateway: VectorSearchGateway;
  contextBlueprints: ContextBlueprintRepository;
}

export interface WorkerInfrastructure {
  supabaseClient: SupabaseClient;
  repositories: WorkerRepositories;
  openaiService: OpenAIService;
  openai: OpenAI;
  sseService: SSEService;
  modelSelectionService: ModelSelectionService;
  logger: Logger;
  metricsCollector: MetricsCollector;
  checkpointManager: CheckpointManager;
  statusUpdater: StatusUpdater;
  cardImageService: CardImageService;
}

const buildRepositories = (
  supabaseClient: SupabaseClient
): WorkerRepositories => ({
  agents: new AgentsRepository(supabaseClient),
  agentSessions: new AgentSessionsRepository(supabaseClient),
  checkpoints: new CheckpointsRepository(supabaseClient),
  transcripts: new TranscriptsRepository(supabaseClient),
  glossary: new GlossaryRepository(supabaseClient),
  agentOutputs: new AgentOutputsRepository(supabaseClient),
  cards: new CardsRepository(supabaseClient),
  facts: new FactsRepository(supabaseClient),
  vectorSearchGateway: new VectorSearchGateway(supabaseClient),
  contextBlueprints: new ContextBlueprintRepository(supabaseClient),
});

export const createWorkerInfrastructure = (
  env: WorkerEnvConfig
): WorkerInfrastructure => {
  const supabaseClient = createSupabaseClient(env.supabaseUrl, env.serviceRoleKey);
  const repositories = buildRepositories(supabaseClient);
  const openaiService = new OpenAIService(
    env.openaiApiKey,
    env.embedModel,
    env.contextGenModel,
    env.modelSet
  );
  const openai = openaiService.getClient();
  const sseService = new SSEService(env.sseEndpoint);
  const modelSelectionService = new ModelSelectionService();

  const logger = new Logger();
  const metricsCollector = new MetricsCollector();
  const checkpointManager = new CheckpointManager(repositories.checkpoints);
  const statusUpdater = new StatusUpdater(
    repositories.agentSessions,
    sseService,
    logger,
    metricsCollector,
    env.cardsModel
  );
  const exaClient = env.exaApiKey ? new Exa(env.exaApiKey) : undefined;
  // Image fetch provider - default to 'pexels', change in code if needed
  const imageFetchProvider: ImageFetchProvider = 'pexels';
  
  // Image generation model - default to 'gpt-image-1-mini', bypasses env var resolution
  const imageGenModel = 'gpt-image-1-mini';

  const cardImageService = new CardImageService(
    supabaseClient,
    env.cardsImageBucket,
    logger,
    metricsCollector,
    openai,
    imageGenModel,
    imageFetchProvider,
    env.pexelsApiKey,
    env.googleApiKey,
    env.googleSearchEngineId,
    exaClient
  );

  return {
    supabaseClient,
    repositories,
    openaiService,
    openai,
    sseService,
    modelSelectionService,
    logger,
    metricsCollector,
    checkpointManager,
    statusUpdater,
    cardImageService,
  };
};
