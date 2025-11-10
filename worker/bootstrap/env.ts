import type { ModelSet } from '../services/model-management/model-providers';
import {
  resolveModelOrThrow,
  resolveModelSetFromEnv,
} from '../services/model-management/model-resolver';

export interface WorkerEnvConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  openaiApiKey: string;
  modelSet: ModelSet;
  embedModel: string;
  chunksPolishModel: string;
  contextGenModel: string;
  stubResearchModel: string;
  glossaryModel: string;
  cardsModel: string;
  exaApiKey?: string;
  sseEndpoint: string;
  workerPort: number;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
};

const sanitizeEndpoint = (rawEndpoint: string): string => {
  const trimmed = rawEndpoint.trim().replace(/[`'"]/g, '');
  if (!trimmed) {
    throw new Error('SSE_ENDPOINT must not be empty');
  }

  try {
    // Validate format via URL constructor (throws on invalid URL)
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new Error(`Invalid SSE_ENDPOINT: ${trimmed}`);
  }
};

const parseWorkerPort = (value: string | undefined): number => {
  const fallback = 3001;
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`WORKER_PORT must be a positive integer (received ${value})`);
  }
  return parsed;
};

export const loadWorkerEnv = (): WorkerEnvConfig => {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const modelSet = resolveModelSetFromEnv();
  const embedModel = resolveModelOrThrow({
    modelKey: 'context.chunking',
    modelSet,
  });
  const chunksPolishModel = resolveModelOrThrow({
    modelKey: 'context.chunk_polish',
    modelSet,
  });
  const contextGenModel = resolveModelOrThrow({
    modelKey: 'context.blueprint',
    modelSet,
  });
  const stubResearchModel = resolveModelOrThrow({
    modelKey: 'context.stub_research',
    modelSet,
  });
  const glossaryModel = resolveModelOrThrow({
    modelKey: 'context.glossary',
    modelSet,
  });
  const cardsModel = resolveModelOrThrow({
    modelKey: 'runtime.cards_generation',
    modelSet,
  });
  const openaiApiKey = resolveModelOrThrow({
    modelKey: 'runtime.api_key',
    modelSet,
  });
  const sseEndpointRaw = process.env.SSE_ENDPOINT || 'http://localhost:3000';
  const sseEndpoint = sanitizeEndpoint(sseEndpointRaw);
  const workerPort = parseWorkerPort(process.env.WORKER_PORT);

  return {
    supabaseUrl,
    serviceRoleKey,
    openaiApiKey,
    modelSet,
    embedModel,
    chunksPolishModel,
    contextGenModel,
    stubResearchModel,
    glossaryModel,
    cardsModel,
    exaApiKey: process.env.EXA_API_KEY,
    sseEndpoint,
    workerPort,
  };
};
