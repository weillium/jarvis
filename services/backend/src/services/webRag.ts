import { performance } from 'node:perf_hooks';
import pino from 'pino';
import { config } from '../config';
import { metrics } from './metrics';

const log = pino({ name: 'web-rag' });

export interface WebSnippet {
  title: string;
  url: string;
  snippet: string;
}

export interface WebRagResult {
  snippets: WebSnippet[];
  latencyMs: number;
  error?: string;
}

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return config.webRag.allowlist.some((host) => parsed.hostname.endsWith(host));
  } catch {
    return false;
  }
}

export async function webRag(query: string, topK = 3): Promise<WebRagResult> {
  const start = performance.now();
  if (!config.webRag.allowlist.length) {
    return { snippets: [], latencyMs: performance.now() - start, error: 'allowlist_empty' };
  }
  try {
    // Placeholder fetch strategy: not implemented in scaffold.
    const elapsed = performance.now() - start;
    metrics.latencyWeb.observe(elapsed);
    log.debug({ query, topK }, 'web rag skipped (scaffold)');
    return { snippets: [], latencyMs: elapsed, error: 'not_implemented' };
  } catch (err) {
    const elapsed = performance.now() - start;
    metrics.latencyWeb.observe(elapsed);
    log.warn({ err }, 'web rag fetch failed');
    return { snippets: [], latencyMs: elapsed, error: 'fetch_failed' };
  }
}

export function sanitizeSnippets(snippets: WebSnippet[]): WebSnippet[] {
  return snippets.filter((item) => isAllowedUrl(item.url)).slice(0, 5);
}
