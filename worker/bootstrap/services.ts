import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ModelSelectionService } from '../services/model-selection-service';
import { OpenAIService } from '../services/openai-service';
import { SSEService } from '../services/sse-service';
import { Logger } from '../monitoring/logger';
import { MetricsCollector } from '../monitoring/metrics-collector';
import { StatusUpdater } from '../monitoring/status-updater';
import { CheckpointManager } from '../monitoring/checkpoint-manager';
import {
  createSupabaseClient,
  AgentsRepository,
  AgentSessionsRepository,
  CheckpointsRepository,
  TranscriptsRepository,
  GlossaryRepository,
  AgentOutputsRepository,
  FactsRepository,
  VectorSearchGateway,
} from '../services/supabase';
import type { WorkerEnvConfig } from './env';

export interface WorkerRepositories {
  agents: AgentsRepository;
  agentSessions: AgentSessionsRepository;
  checkpoints: CheckpointsRepository;
  transcripts: TranscriptsRepository;
  glossary: GlossaryRepository;
  agentOutputs: AgentOutputsRepository;
  facts: FactsRepository;
  vectorSearchGateway: VectorSearchGateway;
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
  facts: new FactsRepository(supabaseClient),
  vectorSearchGateway: new VectorSearchGateway(supabaseClient),
});

export const createWorkerInfrastructure = (
  env: WorkerEnvConfig
): WorkerInfrastructure => {
  const supabaseClient = createSupabaseClient(env.supabaseUrl, env.serviceRoleKey);
  const repositories = buildRepositories(supabaseClient);
  const openaiService = new OpenAIService(env.openaiApiKey, env.embedModel, env.contextGenModel);
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
  };
};
