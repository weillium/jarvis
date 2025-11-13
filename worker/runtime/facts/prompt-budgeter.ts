import type { Fact } from '../../state/facts-store';
import type { FactsBudgetSnapshot } from '../../types/processing';
import { countTokens } from '../../lib/text/token-counter';
import { groupSimilarFacts, FACT_SIMILARITY_THRESHOLD } from './similarity';

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

export interface MergeOperation {
  representativeKey: string;
  memberKeys: string[];
}

export interface FactAdjustment {
  key: string;
  newConfidence?: number;
  newMissStreak?: number;
}

export interface FactsPromptBudgetResult {
  promptFacts: Fact[];
  selectedFacts: Fact[];
  overflowFacts: Fact[];
  summaryFacts: Fact[];
  metrics: FactsBudgetSnapshot;
  factAdjustments: FactAdjustment[];
  mergeOperations: MergeOperation[];
}

export const FACTS_BUDGET_DEFAULTS = {
  BUDGET_FRACTION: 0.6,
  MIN_FACTS_BUDGET_TOKENS: 192,
  SAFETY_MARGIN_TOKENS: 160,
  SELECTED_BOOST: 0.01,
  OVERFLOW_DECAY: 0.05,
  MIN_CONFIDENCE: 0.1,
  MAX_CONFIDENCE: 1.0,
} as const;

const SUMMARY_PREFIX = '__facts_summary__';
const MIN_ACTIVE_CONFIDENCE = 0.25;
const FAST_DECAY_THRESHOLD = 3;
const FAST_DECAY_AMOUNT = 0.1;
const SLOW_DECAY_AMOUNT = 0.02;
const clampConfidence = (value: number): number => {
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
};

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
    const emptySnapshot: FactsBudgetSnapshot = {
      totalFacts: 0,
      selected: 0,
      overflow: 0,
      summary: 0,
      budgetTokens: 0,
      usedTokens: 0,
      selectionRatio: 0,
      mergedClusters: 0,
      mergedFacts: [],
    };

    return {
      promptFacts: [],
      selectedFacts: [],
      overflowFacts: [],
      summaryFacts: [],
      metrics: emptySnapshot,
      factAdjustments: [],
      mergeOperations: [],
    };
  }

  const remainingBudget = Math.max(
    totalBudgetTokens - transcriptTokens - glossaryTokens - safetyMarginTokens,
    0
  );
  const fractionBudget = Math.floor(totalBudgetTokens * budgetFraction);
  const desiredBudget = Math.min(fractionBudget, remainingBudget);
  const minimumFeasibleBudget = Math.min(minFactsBudgetTokens, remainingBudget);
  const availableBudget =
    remainingBudget === 0 ? 0 : Math.max(desiredBudget, minimumFeasibleBudget);

  const factByKey = new Map<string, Fact>();
  for (const fact of facts) {
    factByKey.set(fact.key, fact);
  }

  const clusters = groupSimilarFacts(facts, FACT_SIMILARITY_THRESHOLD);
  const mergeOperations: MergeOperation[] = [];
  const representativeFacts: Fact[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 0) {
      continue;
    }
    if (cluster.length === 1) {
      representativeFacts.push(cluster[0]);
      continue;
    }

    const representative = chooseRepresentative(cluster);
    const memberKeys = cluster
      .filter((fact) => fact.key !== representative.key)
      .map((fact) => fact.key);

    if (memberKeys.length > 0) {
      mergeOperations.push({
        representativeKey: representative.key,
        memberKeys,
      });
    }

    representativeFacts.push(representative);
  }

  const transcriptWords = buildWordSet(recentTranscript);
  const scoredFacts = representativeFacts.map<ScoredFact>((fact) => {
    const relevance = computeRelevance(transcriptWords, buildWordSet(factToText(fact)));
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
    if (selectedFacts.length === 0 || usedTokens + fact.tokenCost <= availableBudget) {
      selectedFacts.push(fact);
      usedTokens += fact.tokenCost;
    } else {
      overflowFacts.push(fact);
    }
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
  const selectedKeySet = new Set(selectedFacts.map((fact) => fact.key));
  const skippedKeys = facts.map((fact) => fact.key).filter((key) => !selectedKeySet.has(key));

  const factAdjustments: FactAdjustment[] = [];

  for (const key of selectedKeySet) {
    const base = factByKey.get(key);
    if (!base) {
      continue;
    }

    const boosted = clampConfidence(base.confidence + FACTS_BUDGET_DEFAULTS.SELECTED_BOOST);
    factAdjustments.push({
      key,
      newConfidence: boosted,
      newMissStreak: 0,
    });
  }

  for (const key of skippedKeys) {
    const base = factByKey.get(key);
    if (!base) {
      continue;
    }

    const currentMiss = base.missStreak ?? 0;
    const nextMiss = currentMiss + 1;
    const decayAmount = nextMiss >= FAST_DECAY_THRESHOLD ? FAST_DECAY_AMOUNT : SLOW_DECAY_AMOUNT;
    const decayed = Math.max(
      MIN_ACTIVE_CONFIDENCE,
      clampConfidence(base.confidence - decayAmount)
    );

    factAdjustments.push({
      key,
      newConfidence: decayed,
      newMissStreak: nextMiss,
    });
  }

  const metrics: FactsBudgetSnapshot = {
    totalFacts: facts.length,
    selected: selectedFacts.length,
    overflow: overflowFacts.length,
    summary: summaryFacts.length,
    budgetTokens: availableBudget,
    usedTokens,
    selectionRatio: selectedFacts.length / Math.max(facts.length, 1),
    mergedClusters: mergeOperations.length,
    mergedFacts: mergeOperations.map((operation) => ({
      representative: operation.representativeKey,
      members: operation.memberKeys,
    })),
  };

  return {
    promptFacts,
    selectedFacts,
    overflowFacts,
    summaryFacts,
    metrics,
    factAdjustments,
    mergeOperations,
  };
}

function chooseRepresentative(cluster: Fact[]): Fact {
  return cluster.reduce((best, current) => {
    if (!best) {
      return current;
    }
    if (current.confidence > best.confidence) {
      return current;
    }
    if (
      current.confidence === best.confidence &&
      (current.lastSeenSeq ?? 0) > (best.lastSeenSeq ?? 0)
    ) {
      return current;
    }
    return best;
  }, cluster[0]);
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
  if (typeof fact.value === 'string') {
    return `${fact.key}: ${fact.value}`;
  }
  try {
    return `${fact.key}: ${JSON.stringify(fact.value)}`;
  } catch {
    return fact.key;
  }
}

function buildSummaryFact(overflowFacts: Fact[], selectedFacts: Fact[], remainingTokens: number): Fact | null {
  if (remainingTokens <= 0) {
    return null;
  }

  const keys = overflowFacts.slice(0, 5).map((fact) => fact.key);
  const averageConfidence =
    overflowFacts.reduce((sum, fact) => sum + fact.confidence, 0) / Math.max(overflowFacts.length, 1);

  const summaryValue = `Summarized ${overflowFacts.length} additional facts: ${keys.join(', ')}`;
  const now = Date.now();
  const summaryFact: Fact = {
    key: `${SUMMARY_PREFIX}:${now}:${Math.random().toString(36).slice(2, 6)}`,
    value: summaryValue,
    confidence: clampConfidence(averageConfidence),
    lastSeenSeq: selectedFacts.length > 0 ? selectedFacts[0].lastSeenSeq : now,
    sources: [],
    mergedFrom: [],
    mergedAt: null,
    missStreak: 0,
    createdAt: now,
    lastTouchedAt: now,
    dormantAt: null,
    prunedAt: null,
    kind: 'meta',
    originalValue: summaryValue,
  };

  const summaryTokens = estimateFactTokens(summaryFact);
  if (summaryTokens > remainingTokens) {
    return null;
  }

  return summaryFact;
}


