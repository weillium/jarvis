export interface WorkerEnvConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  openaiApiKey: string;
  embedModel: string;
  contextGenModel: string;
  realtimeModel: string;
  exaApiKey?: string;
  sseEndpoint: string;
  transcriptOnly: boolean;
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
  const openaiApiKey = requireEnv('OPENAI_API_KEY');

  const embedModel = process.env.CONTEXT_CHUNKS_MODEL || 'text-embedding-3-small';
  const contextGenModel = process.env.CONTEXT_BLUEPRINT_MODEL || 'gpt-5';
  const realtimeModel = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
  const sseEndpointRaw = process.env.SSE_ENDPOINT || 'http://localhost:3000';
  const sseEndpoint = sanitizeEndpoint(sseEndpointRaw);
  const transcriptOnly = process.env.TRANSCRIPT_AGENT_ONLY !== 'false';
  const workerPort = parseWorkerPort(process.env.WORKER_PORT);

  return {
    supabaseUrl,
    serviceRoleKey,
    openaiApiKey,
    embedModel,
    contextGenModel,
    realtimeModel,
    exaApiKey: process.env.EXA_API_KEY,
    sseEndpoint,
    transcriptOnly,
    workerPort,
  };
};
