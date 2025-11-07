import type { ProcessingMetrics } from '../types';

type AgentMetricsMap = {
  transcript: ProcessingMetrics;
  cards: ProcessingMetrics;
  facts: ProcessingMetrics;
};

export class MetricsCollector {
  private metrics: Map<string, AgentMetricsMap> = new Map();

  recordTokens(
    eventId: string,
    agentType: 'transcript' | 'cards' | 'facts',
    tokens: number,
    warning: boolean,
    critical: boolean
  ): void {
    if (!this.metrics.has(eventId)) {
      this.metrics.set(eventId, {
        transcript: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
        cards: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
        facts: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
      });
    }

    const eventMetrics = this.metrics.get(eventId)!;
    const agentMetrics = eventMetrics[agentType];

    agentMetrics.total += tokens;
    agentMetrics.count += 1;
    agentMetrics.max = Math.max(agentMetrics.max, tokens);
    if (warning) agentMetrics.warnings += 1;
    if (critical) agentMetrics.criticals += 1;
  }

  getMetrics(eventId: string, agentType: 'transcript' | 'cards' | 'facts'): ProcessingMetrics {
    const metrics = this.metrics.get(eventId);
    if (!metrics) {
      return { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 };
    }
    return metrics[agentType];
  }

  clear(eventId: string): void {
    this.metrics.delete(eventId);
  }
}
