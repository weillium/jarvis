import axios, { AxiosError } from 'axios';
import { performance } from 'node:perf_hooks';
import pino from 'pino';
import { config } from '../config';
import { metrics } from './metrics';

const log = pino({ name: 'llm-adapter' });

interface TogetherMessage {
  role: 'system' | 'user';
  content: string;
}

interface TogetherResponse {
  cards?: unknown[];
  explain?: unknown;
}

const togetherClient = axios.create({
  baseURL: 'https://api.together.xyz/v1',
  timeout: config.llm.timeoutMs
});

togetherClient.interceptors.request.use((request) => {
  request.headers = request.headers ?? {};
  request.headers.Authorization = `Bearer ${process.env.TOGETHER_API_KEY ?? ''}`;
  return request;
});

export async function callTogether(input: unknown, abortSignal?: AbortSignal): Promise<TogetherResponse> {
  return attemptCall(input, abortSignal, 1);
}

async function attemptCall(input: unknown, abortSignal: AbortSignal | undefined, attempt: number): Promise<TogetherResponse> {
  const body = {
    model: config.llm.model,
    messages: buildMessages(input),
    temperature: config.llm.temperature,
    top_p: config.llm.topP,
    max_tokens: config.llm.maxTokens,
    response_format: { type: 'json_object' }
  };

  const start = performance.now();
  try {
    const response = await togetherClient.post('/chat/completions', body, {
      signal: abortSignal,
      timeout: config.llm.timeoutMs,
      transitional: { clarifyTimeoutError: true }
    });
    metrics.latencyLlm.observe(performance.now() - start);
    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch (err) {
        log.warn({ err, content }, 'failed to parse together response content');
        return { cards: [], explain: { notes: 'json_parse_error' } };
      }
    }
    return { cards: [], explain: { notes: 'empty_content' } };
  } catch (rawErr) {
    metrics.latencyLlm.observe(performance.now() - start);
    const err = rawErr as AxiosError;
    log.warn({ attempt, err: err.toJSON?.() ?? err.message }, 'together call error');
    if (attempt >= 2) {
      throw err;
    }
    return attemptCall(input, abortSignal, attempt + 1);
  }
}

function buildMessages(input: unknown): TogetherMessage[] {
  const systemPrompt = process.env.JARVIS_SYS ?? 'You are Jarvis Runtime. Produce concise learning cards as strict JSON.';
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(input) }
  ];
}
