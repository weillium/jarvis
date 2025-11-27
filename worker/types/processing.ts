export interface AgentContext {
  bullets: string[];
  // TODO: narrow unknown -> Record<string, FactRecord> after upstream callsite analysis
  facts: Record<string, unknown>;
  glossaryContext: string;
}

export interface FactsBudgetSnapshot {
  totalFacts: number;
  selected: number;
  overflow: number;
  summary: number;
  budgetTokens: number;
  usedTokens: number;
  selectionRatio: number;
  mergedClusters: number;
  mergedFacts: Array<{
    representative: string;
    members: string[];
  }>;
}

export interface ProcessingMetrics {
  total: number;
  count: number;
  max: number;
  warnings: number;
  criticals: number;
  lastBudget?: FactsBudgetSnapshot;
  imageGenerationCost: number;
  imageGenerationCount: number;
}
