import fs from 'fs';
import path from 'path';

const DEFAULT_CORS = ['https://your-web.app'];

function resolveCorsOrigins(raw?: string | null): string[] {
  if (!raw) return DEFAULT_CORS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function loadAllowlist(filePath: string): string[] {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const bundlesDir = path.resolve(process.env.BUNDLES_DIR ?? path.join(process.cwd(), 'bundles'));
const allowlistPath = process.env.WEB_RAG_ALLOWLIST_FILE ?? path.join(process.cwd(), 'services/backend/config/allowlist.txt');

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  bundlesDir,
  corsOrigins: resolveCorsOrigins(process.env.CORS_ORIGINS ?? DEFAULT_CORS.join(',')),
  wsHeartbeatMs: 20000,
  wsMissedHeartbeatsBeforeClose: 2,
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'together',
    model: process.env.LLM_MODEL ?? 'phi-4-mini-instruct',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 3000),
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
    topP: Number(process.env.LLM_TOP_P ?? 0.9),
    maxTokens: Number(process.env.LLM_MAX_TOKENS ?? 256)
  },
  retrieval: {
    weights: { w1: 0.4, w2: 0.35, w3: 0.15, w4: 0.1 },
    thresholds: { composeLocal: 0.75, tryWebMin: 0.45, tryWebMax: 0.74 }
  },
  webRag: {
    allowlist: loadAllowlist(allowlistPath),
    timeoutMs: Number(process.env.WEB_RAG_TIMEOUT_MS ?? 1500)
  },
  policies: {
    cooldownSeconds: Number(process.env.CARDS_COOLDOWN_S ?? 20),
    maxCardsPerMin: Number(process.env.CARDS_MAX_PER_MIN ?? 12),
    mergeWindowMs: Number(process.env.MERGE_WINDOW_MS ?? 1500)
  }
} as const;

export type Config = typeof config;
