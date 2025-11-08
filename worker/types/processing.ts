export interface AgentContext {
  bullets: string[];
  // TODO: narrow unknown -> Record<string, FactRecord> after upstream callsite analysis
  facts: Record<string, unknown>;
  glossaryContext: string;
}

export interface ProcessingMetrics {
  total: number;
  count: number;
  max: number;
  warnings: number;
  criticals: number;
}
