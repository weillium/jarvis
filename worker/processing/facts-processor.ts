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
const SYNC_DEBOUNCE_MS = 5000; // Sync at most once every 5 seconds

export class FactsProcessor {
  private lastSyncTimes = new Map<string, number>();

  constructor(
    private contextBuilder: ContextBuilder,
    private logger: Logger,
    private metrics: MetricsCollector,
    private checkpointManager: CheckpointManager,
    private factsRepository: FactsRepository
  ) {}

  /**
   * Sync deactivated facts from database - removes facts that were deactivated via UI moderation
   * Uses debouncing to avoid excessive database queries
   */
  private async syncDeactivatedFacts(runtime: EventRuntime): Promise<void> {
    try {
      const now = Date.now();
      const lastSyncTime = this.lastSyncTimes.get(runtime.eventId);

      // Debounce: skip if synced recently
      if (lastSyncTime !== undefined && now - lastSyncTime < SYNC_DEBOUNCE_MS) {
        return;
      }

      const deactivatedKeys = await this.factsRepository.getDeactivatedFactKeys(runtime.eventId);
      if (deactivatedKeys.length === 0) {
        this.lastSyncTimes.set(runtime.eventId, now);
        return;
      }

      const factsStore = runtime.factsStore;
      let removedCount = 0;
      for (const key of deactivatedKeys) {
        if (factsStore.get(key)) {
          factsStore.delete(key);
          removedCount++;
        }
      }

      this.lastSyncTimes.set(runtime.eventId, now);

      if (removedCount > 0) {
        console.log(
          `[facts-processor] Removed ${removedCount} deactivated fact(s) from FactsStore for event ${runtime.eventId}`
        );
      }
    } catch (error: unknown) {
      console.error('[facts-processor] Error syncing deactivated facts:', String(error));
    }
  }

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

      // Sync deactivated facts before using them
      await this.syncDeactivatedFacts(runtime);

      const allFacts = runtime.factsStore.getAll();
      const eligibleFacts = allFacts.filter((fact) => !fact.excludeFromPrompt);
      const excludedCount = allFacts.length - eligibleFacts.length;
      const { context: baseContext, recentText } = this.contextBuilder.buildFactsContext(runtime);

      const cleanedTranscript = filterTranscriptForFacts(recentText);
      const recentTextForPrompt = cleanedTranscript.length > 0 ? cleanedTranscript : recentText;

      if (recentTextForPrompt.trim().length === 0) {
        // console.log('[facts][debug] skipping facts generation: empty transcript window');
        return;
      }

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

      const lifecycleUpdates = new Map<string, FactLifecycleUpdate>();
      const demotedDormantKeys: string[] = [];

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

      for (const demoted of demotedFacts) {
        const marked = runtime.factsStore.markDormant(demoted.key, now, FACT_DORMANT_CONFIDENCE_DROP);
        if (marked) {
          demotedDormantKeys.push(demoted.key);
          mergeLifecycleUpdate(lifecycleUpdates, demoted.key, {
            isActive: false,
            dormantAt: new Date(now).toISOString(),
          });
        }
      }

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
          mergeLifecycleUpdate(lifecycleUpdates, key, {
            isActive: true,
            dormantAt: null,
          });
        }
      }

      const newDormantKeys: string[] = [];
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
              newDormantKeys.push(fact.key);
              mergeLifecycleUpdate(lifecycleUpdates, fact.key, {
                isActive: false,
                dormantAt: new Date(now).toISOString(),
              });
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
        const prunedIso = new Date(now).toISOString();
        for (const key of prunedKeys) {
          mergeLifecycleUpdate(lifecycleUpdates, key, {
            isActive: false,
            dormantAt: null,
            prunedAt: prunedIso,
          });
        }
        this.logger.log(runtime.eventId, 'facts', 'log', `[lifecycle] pruned facts: ${formatLifecycleList(prunedKeys)}`, {
          prunedKeys,
        });
      }

      const allDormantKeys = Array.from(
        new Set<string>([...newDormantKeys, ...demotedDormantKeys])
      );
      if (allDormantKeys.length > 0) {
        this.logger.log(
          runtime.eventId,
          'facts',
          'log',
          `[lifecycle] dormant facts: ${formatLifecycleList(allDormantKeys)}`,
          { dormantKeys: allDormantKeys }
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

      if (lifecycleUpdates.size > 0) {
        const lifecyclePayload = Array.from(lifecycleUpdates.entries()).map(([key, update]) => ({
          key,
          ...update,
        }));
        await this.factsRepository.updateFactLifecycle(runtime.eventId, lifecyclePayload);
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

type FactLifecycleUpdate = {
  isActive?: boolean;
  dormantAt?: string | null;
  prunedAt?: string | null;
};

const mergeLifecycleUpdate = (
  target: Map<string, FactLifecycleUpdate>,
  key: string,
  patch: FactLifecycleUpdate
): void => {
  const existing = target.get(key) ?? {};
  target.set(key, { ...existing, ...patch });
};
