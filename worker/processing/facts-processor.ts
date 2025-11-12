import type { EventRuntime, Fact } from '../types';
import type { AgentContext, ContextBuilder } from '../context/context-builder';
import type { Logger } from '../services/observability/logger';
import type { MetricsCollector } from '../services/observability/metrics-collector';
import type { CheckpointManager } from '../services/observability/checkpoint-manager';
import type { FactsRepository } from '../services/supabase/facts-repository';
import type { AgentRealtimeSession } from '../sessions/session-adapters';
import { budgetFactsPrompt } from '../runtime/facts/prompt-budgeter';
import type { FactsPromptBudgetResult } from '../runtime/facts/prompt-budgeter';
import { checkBudgetStatus, countTokens, formatTokenBreakdown } from '../lib/text/token-counter';
import { filterTranscriptForFacts } from '../lib/text/transcript-filter';

const buildPromptFactsRecord = (
  facts: Fact[]
): Record<string, { value: unknown; confidence: number }> => {
  return facts.reduce<Record<string, { value: unknown; confidence: number }>>((acc, fact) => {
    acc[fact.key] = {
      value: fact.value,
      confidence: fact.confidence,
    };
    return acc;
  }, {});
};

const formatLifecycleList = (keys: string[]): string => {
  if (keys.length === 0) {
    return '';
  }
  if (keys.length <= 5) {
    return keys.join(', ');
  }
  return `${keys.slice(0, 5).join(', ')} (+${keys.length - 5} more)`;
};

const FACT_DORMANT_MISS_THRESHOLD = 5;
const FACT_DORMANT_IDLE_MS = 15 * 60 * 1000;
const FACT_PRUNE_IDLE_MS = 60 * 60 * 1000;
const FACT_DORMANT_CONFIDENCE_DROP = 0.05;
const FACT_REVIVE_HYSTERESIS_DELTA = 0.05;
const FACT_PROMPT_LIMIT = 50;

export class FactsProcessor {
  constructor(
    private contextBuilder: ContextBuilder,
    private logger: Logger,
    private metrics: MetricsCollector,
    private checkpointManager: CheckpointManager,
    private factsRepository: FactsRepository
  ) {}

  async process(
    runtime: EventRuntime,
    session: AgentRealtimeSession | undefined,
    sessionId: string | undefined
  ): Promise<void> {
    if (!session || !sessionId) {
      this.logger.log(runtime.eventId, 'facts', 'warn', `No session for event ${runtime.eventId}`);
      return;
    }

    try {
      const previousSnapshot: Fact[] = runtime.factsStore.getAll(true);
      const previousConfidence = new Map<string, number>(
        previousSnapshot.map((fact) => [fact.key, fact.confidence] as const)
      );

      const allFacts = runtime.factsStore.getAll();
      const eligibleFacts = allFacts.filter((fact) => !fact.excludeFromPrompt);
      const excludedCount = allFacts.length - eligibleFacts.length;
      const { context: baseContext, recentText } = this.contextBuilder.buildFactsContext(runtime);

      const cleanedTranscript = filterTranscriptForFacts(recentText);
      const recentTextForPrompt = cleanedTranscript.length > 0 ? cleanedTranscript : recentText;

      const { activeFacts, demotedFacts } = selectTopFactsForPrompt(
        eligibleFacts,
        FACT_PROMPT_LIMIT
      );

      const recentTextTokens = countTokens(recentTextForPrompt);
      const glossaryTokens = countTokens(baseContext.glossaryContext);

      const budgetResult: FactsPromptBudgetResult = budgetFactsPrompt({
        facts: activeFacts,
        recentTranscript: recentTextForPrompt,
        totalBudgetTokens: 2048,
        transcriptTokens: recentTextTokens,
        glossaryTokens,
      });

      const selectedKeySet = new Set<string>(
        budgetResult.selectedFacts.map((fact: Fact) => fact.key)
      );

      const promptFacts = budgetResult.promptFacts;
      const promptFactsRecord = buildPromptFactsRecord(promptFacts);
      const promptContext: AgentContext = {
        bullets: [],
        facts: promptFactsRecord,
        glossaryContext: baseContext.glossaryContext,
      };

      const tokenBreakdown = this.contextBuilder.getFactsTokenBreakdown(
        promptContext,
        recentTextForPrompt
      );
      const budgetStatus = checkBudgetStatus(tokenBreakdown.total, 2048);
      const breakdownStr = formatTokenBreakdown(tokenBreakdown.breakdown);

      let logLevel: 'log' | 'warn' | 'error' = 'log';
      let logPrefix = `[context]`;

      if (budgetStatus.critical) {
        logLevel = 'error';
        logPrefix = `[context] ⚠️ CRITICAL`;
      } else if (budgetStatus.warning) {
        logLevel = 'warn';
        logPrefix = `[context] ⚠️ WARNING`;
      }

      const logMessage = `${logPrefix} Facts Agent (seq ${runtime.factsLastSeq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr} | selected ${budgetResult.metrics.selected}/${budgetResult.metrics.totalFacts} (summary ${budgetResult.metrics.summary}) | merged ${budgetResult.metrics.mergedClusters}`;
      this.logger.log(runtime.eventId, 'facts', logLevel, logMessage, {
        seq: runtime.factsLastSeq,
        excludedFacts: excludedCount,
        demotedFacts: demotedFacts.length,
      });

      this.metrics.recordTokens(
        runtime.eventId,
        'facts',
        tokenBreakdown.total,
        budgetStatus.warning,
        budgetStatus.critical,
        budgetResult.metrics
      );

      await session.sendMessage(recentTextForPrompt, {
        recentText: recentTextForPrompt,
        facts: promptFacts,
        glossaryContext: baseContext.glossaryContext,
      });

      const mergeTimestamp = new Date().toISOString();
      for (const operation of budgetResult.mergeOperations ?? []) {
        runtime.factsStore.recordMerge(operation.representativeKey, operation.memberKeys, mergeTimestamp);
      }

      runtime.factsStore.applyConfidenceAdjustments(budgetResult.factAdjustments ?? []);
      const now = Date.now();
      const revivedKeys: string[] = [];
      for (const key of selectedKeySet) {
        const currentFact = runtime.factsStore.get(key);
        if (!currentFact) {
          continue;
        }
        const revived = runtime.factsStore.reviveFromSelection(
          key,
          previousConfidence.get(key),
          currentFact.confidence,
          now,
          FACT_REVIVE_HYSTERESIS_DELTA
        );
        if (revived) {
          revivedKeys.push(key);
        }
      }

      const dormantKeys: string[] = [];
      const snapshotAfter: Fact[] = runtime.factsStore.getAll(true);
      for (const fact of snapshotAfter) {
        if (selectedKeySet.has(fact.key)) {
          continue;
        }

        if (!runtime.factsStore.isDormant(fact.key)) {
          const idleMs = now - fact.lastTouchedAt;
          if (
            fact.missStreak >= FACT_DORMANT_MISS_THRESHOLD ||
            idleMs >= FACT_DORMANT_IDLE_MS
          ) {
            if (runtime.factsStore.markDormant(fact.key, now, FACT_DORMANT_CONFIDENCE_DROP)) {
              dormantKeys.push(fact.key);
            }
          }
        } else {
          const dormantSince = fact.dormantAt ?? fact.lastTouchedAt;
          if (now - dormantSince >= FACT_PRUNE_IDLE_MS) {
            runtime.factsStore.prune(fact.key, now);
          }
        }
      }

      const prunedKeys = runtime.factsStore.drainPrunedKeys();
      if (prunedKeys.length > 0) {
        await this.factsRepository.updateFactActiveStatus(runtime.eventId, prunedKeys, false);
        this.logger.log(runtime.eventId, 'facts', 'log', `[lifecycle] pruned facts: ${formatLifecycleList(prunedKeys)}`, {
          prunedKeys,
        });
      }

      if (dormantKeys.length > 0) {
        this.logger.log(
          runtime.eventId,
          'facts',
          'log',
          `[lifecycle] dormant facts: ${formatLifecycleList(dormantKeys)}`,
          { dormantKeys }
        );
      }

      if (revivedKeys.length > 0) {
        this.logger.log(
          runtime.eventId,
          'facts',
          'log',
          `[lifecycle] revived facts: ${formatLifecycleList(revivedKeys)}`,
          { revivedKeys }
        );
      }
      await this.checkpointManager.saveCheckpoint(
        runtime.eventId,
        'facts',
        runtime.factsLastSeq
      );
      runtime.factsLastUpdate = Date.now();
      // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

}

const selectTopFactsForPrompt = (facts: Fact[], limit: number): {
  activeFacts: Fact[];
  demotedFacts: Fact[];
} => {
  if (facts.length <= limit) {
    return {
      activeFacts: facts.slice(),
      demotedFacts: [],
    };
  }

  const sorted = facts.slice().sort(compareFactPriority);
  return {
    activeFacts: sorted.slice(0, limit),
    demotedFacts: sorted.slice(limit),
  };
};

const compareFactPriority = (a: Fact, b: Fact): number => {
  if (b.confidence !== a.confidence) {
    return b.confidence - a.confidence;
  }

  if (b.lastTouchedAt !== a.lastTouchedAt) {
    return b.lastTouchedAt - a.lastTouchedAt;
  }

  if (b.lastSeenSeq !== a.lastSeenSeq) {
    return b.lastSeenSeq - a.lastSeenSeq;
  }

  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
};
