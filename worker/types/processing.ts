import type { TranscriptChunk } from './runtime';

export interface AgentContext {
  bullets: string[];
  facts: Record<string, any>;
  glossaryContext: string;
}

export interface ProcessingMetrics {
  total: number;
  count: number;
  max: number;
  warnings: number;
  criticals: number;
}
