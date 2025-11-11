import type { Fact } from '../../state/facts-store';
import { countTokens } from '../../utils/token-counter';

interface FactsPromptBudgetOptions {
  facts: Fact[];
  recentTranscript: string;
  totalBudgetTokens: number;
  transcriptTokens: number;
  glossaryTokens: number;
  budgetFraction?: number;
  minFactsBudgetTokens?: number;
  safetyMarginTokens?: number;
}

export interface ConfidenceAdjustment {
  key: string;
  newConfidence: number;
}

interface BudgetMetrics {
  totalFacts: number;
  selectedFacts: number;
  overflowFacts: number;
  summaryFacts: number;
  budgetTokens: number;
  usedTokens: number;
  selectionRatio: number;
}

export interface FactsPromptBudgetResult {
  promptFacts: Fact[];
  selectedFacts: Fact[];
  overflowFacts: Fact[];
  summaryFacts: Fact[];
  metrics: BudgetMetrics;
  confidenceAdjustments: ConfidenceAdjustment[];
}

export const FACTS_BUDGET_DEFAULTS = {
  BUDGET_FRACTION: 0.6,
  MIN_FACTS_BUDGET_TOKENS: 192,
  SAFETY_MARGIN_TOKENS: 160,
  SELECTED_BOOST: 0.01,
  OVERFLOW_DECAY: 0.05,
  MIN_CONFIDENCE: 0.1,
  MAX_CONFIDENCE: 1.0,
  SUMMARY_PREFIX: '__facts_summary__',
} as const;

type ScoredFact = Fact & {
  score: number;
  tokenCost: number;
};

export function budgetFactsPrompt(options: FactsPromptBudgetOptions): FactsPromptBudgetResult {
  const {
    facts,
    recentTranscript,
    totalBudgetTokens,
    transcriptTokens,
    glossaryTokens,
    budgetFraction = FACTS_BUDGET_DEFAULTS.BUDGET_FRACTION,
    minFactsBudgetTokens = FACTS_BUDGET_DEFAULTS.MIN_FACTS_BUDGET_TOKENS,
    safetyMarginTokens = FACTS_BUDGET_DEFAULTS.SAFETY_MARGIN_TOKENS,
  } = options;

  if (facts.length === 0) {
    return {
      promptFacts: [],
      selectedFacts: [],
      overflowFacts: [],
      summaryFacts: [],
      metrics: {
        totalFacts: 0,
        selectedFacts: 0,
        overflowFacts: 0,
        summaryFacts: 0,
        budgetTokens: 0,
        usedTokens: 0,
        selectionRatio: 0,
      },
      confidenceAdjustments: [],
    };
  }

  const availableBudget = Math.max(
    minFactsBudgetTokens,
    Math.min(
      Math.floor(totalBudgetTokens * budgetFraction),
      Math.max(totalBudgetTokens - transcriptTokens - glossaryTokens - safetyMarginTokens, minFactsBudgetTokens)
    )
  );

  const transcriptWords = buildWordSet(recentTranscript);
  const scoredFacts = facts.map<ScoredFact>((fact) => {
    const factText = factToText(fact);
    const factWords = buildWordSet(factText);
    const relevance = computeRelevance(transcriptWords, factWords);
    const recency = normalizeRecency(fact.lastSeenSeq, facts);
    const confidenceScore = fact.confidence;
    const score = relevance * 0.5 + recency * 0.3 + confidenceScore * 0.2;
    const tokenCost = estimateFactTokens(fact);
    return {
      ...fact,
      score,
      tokenCost,
    };
  });

  scoredFacts.sort((a, b) => b.score - a.score);

  const selectedFacts: Fact[] = [];
  const overflowFacts: Fact[] = [];
  let usedTokens = 0;

  for (const fact of scoredFacts) {
    if (selectedFacts.length === 0) {
      selectedFacts.push(fact);
      usedTokens += fact.tokenCost;
      continue;
    }

    if (usedTokens + fact.tokenCost <= availableBudget) {
      selectedFacts.push(fact);
      usedTokens += fact.tokenCost;
      continue;
    }

    overflowFacts.push(fact);
  }

  const summaryFacts: Fact[] = [];

  if (overflowFacts.length > 0) {
    const summary = buildSummaryFact(overflowFacts, selectedFacts, availableBudget - usedTokens);
    if (summary) {
      summaryFacts.push(summary);
      usedTokens += estimateFactTokens(summary);
    }
  }

  const promptFacts = [...selectedFacts, ...summaryFacts];

  const confidenceAdjustments: ConfidenceAdjustment[] = [];

  for (const fact of selectedFacts) {
    const boosted = clampConfidence(fact.confidence + FACTS_BUDGET_DEFAULTS.SELECTED_BOOST);
    if (Math.abs(boosted - fact.confidence) >= 0.001) {
      confidenceAdjustments.push({ key: fact.key, newConfidence: boosted });
    }
  }

  for (const fact of overflowFacts) {
    const decayed = clampConfidence(fact.confidence - FACTS_BUDGET_DEFAULTS.OVERFLOW_DECAY);
    if (Math.abs(decayed - fact.confidence) >= 0.001) {
      confidenceAdjustments.push({ key: fact.key, newConfidence: decayed });
    }
  }

  const metrics: BudgetMetrics = {
    totalFacts: facts.length,
    selectedFacts: selectedFacts.length,
    overflowFacts: overflowFacts.length,
    summaryFacts: summaryFacts.length,
    budgetTokens: availableBudget,
    usedTokens,
    selectionRatio: selectedFacts.length / Math.max(facts.length, 1),
  };

  return {
    promptFacts,
    selectedFacts,
    overflowFacts,
    summaryFacts,
    metrics,
    confidenceAdjustments,
  };
}

function buildWordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean)
  );
}

function computeRelevance(transcriptWords: Set<string>, factWords: Set<string>): number {
  if (factWords.size === 0) {
    return 0;
  }
  let overlap = 0;
  factWords.forEach((word) => {
    if (transcriptWords.has(word)) {
      overlap += 1;
    }
  });
  return overlap / factWords.size;
}

function normalizeRecency(value: number, facts: Fact[]): number {
  if (facts.length === 0) {
    return 0;
  }
  const seqValues = facts.map((fact) => fact.lastSeenSeq ?? 0);
  const minSeq = Math.min(...seqValues);
  const maxSeq = Math.max(...seqValues);
  if (maxSeq === minSeq) {
    return 0.5;
  }
  return (value - minSeq) / (maxSeq - minSeq);
}

function estimateFactTokens(fact: Fact): number {
  return countTokens(factToText(fact));
}

function factToText(fact: Fact): string {
  const value =
    typeof fact.value === 'string'
      ? fact.value
      : JSON.stringify(fact.value, (_key, val) => {
          if (typeof val === 'number' || typeof val === 'string') {
            return val;
          }
          return val;
        });
  return `${fact.key}: ${value}`;
}

function buildSummaryFact(overflowFacts: Fact[], selectedFacts: Fact[], remainingTokens: number): Fact | null {
  if (remainingTokens <= 0) {
    return null;
  }

  const keys = overflowFacts.slice(0, 5).map((fact) => fact.key);
  const averageConfidence =
    overflowFacts.reduce((sum, fact) => sum + fact.confidence, 0) / Math.max(overflowFacts.length, 1);

  const summaryValue = `Summarized ${overflowFacts.length} additional facts: ${keys.join(', ')}`;
  const summaryFact: Fact = {
    key: `${FACTS_BUDGET_DEFAULTS.SUMMARY_PREFIX}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
    value: summaryValue,
    confidence: clampConfidence(averageConfidence),
    lastSeenSeq: selectedFacts.length > 0 ? selectedFacts[0].lastSeenSeq : Date.now(),
    sources: [],
  };

  const summaryTokens = estimateFactTokens(summaryFact);
  if (summaryTokens > remainingTokens) {
    return null;
  }

  return summaryFact;
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return FACTS_BUDGET_DEFAULTS.MIN_CONFIDENCE;
  }
  if (value < FACTS_BUDGET_DEFAULTS.MIN_CONFIDENCE) {
    return FACTS_BUDGET_DEFAULTS.MIN_CONFIDENCE;
  }
  if (value > FACTS_BUDGET_DEFAULTS.MAX_CONFIDENCE) {
    return FACTS_BUDGET_DEFAULTS.MAX_CONFIDENCE;
  }
  return value;
}

