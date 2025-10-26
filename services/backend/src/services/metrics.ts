import type { Express } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const metrics = {
  latencyEnd: new Histogram({
    name: 'jarvis_latency_end_ms',
    help: 'End-to-end latency per transcript frame',
    buckets: [50, 100, 250, 500, 1000, 2000, 5000, 7500],
    registers: [registry]
  }),
  latencySql: new Histogram({
    name: 'jarvis_latency_sql_ms',
    help: 'SQL retrieval latency',
    buckets: [10, 25, 50, 100, 250, 500, 1000],
    registers: [registry]
  }),
  latencyVec: new Histogram({
    name: 'jarvis_latency_vec_ms',
    help: 'Vector retrieval latency',
    buckets: [10, 25, 50, 100, 250, 500, 1000],
    registers: [registry]
  }),
  latencyWeb: new Histogram({
    name: 'jarvis_latency_web_ms',
    help: 'Web retrieval latency',
    buckets: [50, 100, 250, 500, 1000, 1500, 2500],
    registers: [registry]
  }),
  latencyLlm: new Histogram({
    name: 'jarvis_latency_llm_ms',
    help: 'LLM call latency',
    buckets: [100, 250, 500, 1000, 1500, 2500, 4000],
    registers: [registry]
  }),
  cardsEmitted: new Counter({
    name: 'jarvis_cards_emitted_total',
    help: 'Total cards emitted to clients',
    registers: [registry]
  }),
  cardsSuppressed: new Counter({
    name: 'jarvis_cards_suppressed_total',
    help: 'Cards filtered by validation or throttling',
    registers: [registry]
  }),
  jsonInvalid: new Counter({
    name: 'jarvis_json_invalid_total',
    help: 'Invalid card payloads from LLM',
    registers: [registry]
  }),
  retrievalMix: new Counter({
    name: 'jarvis_retrieval_mix',
    help: 'Retrieval usage mix',
    labelNames: ['source'],
    registers: [registry]
  })
};

export function initMetricsRoute(app: Express) {
  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });
}
