import type { EventRuntime, Fact } from '../types';
import type { FactsBudgetSnapshot } from '../types/processing';
import type { AgentContext, ContextBuilder } from '../context/context-builder';
import type { Logger } from '../services/observability/logger';
import type { MetricsCollector } from '../services/observability/metrics-collector';
import type { CheckpointManager } from '../services/observability/checkpoint-manager';
import type { AgentRealtimeSession } from '../sessions/session-adapters';
import { budgetFactsPrompt } from '../runtime/facts/prompt-budgeter';
import type { FactsPromptBudgetResult } from '../runtime/facts/prompt-budgeter';
import { checkBudgetStatus, countTokens, formatTokenBreakdown } from '../lib/text/token-counter';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFactsBudgetSnapshot = (value: unknown): value is FactsBudgetSnapshot => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.totalFacts === 'number' &&
    typeof value.selected === 'number' &&
    typeof value.overflow === 'number' &&
    typeof value.summary === 'number' &&
    typeof value.budgetTokens === 'number' &&
    typeof value.usedTokens === 'number' &&
    typeof value.selectionRatio === 'number' &&
    typeof value.mergedClusters === 'number' &&
    Array.isArray(value.mergedFacts)
  );
};

const isFactsPromptBudgetResult = (value: unknown): value is FactsPromptBudgetResult => {
  if (!isRecord(value)) {
    return false;
  }

  if (
    !Array.isArray(value.promptFacts) ||
    !Array.isArray(value.selectedFacts) ||
    !Array.isArray(value.overflowFacts) ||
    !Array.isArray(value.summaryFacts)
  ) {
    return false;
  }

  if (!isFactsBudgetSnapshot(value.metrics)) {
    return false;
  }

  if ('factAdjustments' in value && !Array.isArray(value.factAdjustments)) {
    return false;
  }

  if ('mergeOperations' in value && !Array.isArray(value.mergeOperations)) {
    return false;
  }

  return true;
};

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

export class FactsProcessor {
  constructor(
    private contextBuilder: ContextBuilder,
    private logger: Logger,
    private metrics: MetricsCollector,
    private checkpointManager: CheckpointManager
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
      const allFacts = runtime.factsStore.getAll();
      const { context: baseContext, recentText } = this.contextBuilder.buildFactsContext(runtime);

      const recentTextTokens = countTokens(recentText);
      const glossaryTokens = countTokens(baseContext.glossaryContext);

      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
      const possibleResult = budgetFactsPrompt({
        facts: allFacts,
        recentTranscript: recentText,
        totalBudgetTokens: 2048,
        transcriptTokens: recentTextTokens,
        glossaryTokens,
      });

      if (!isFactsPromptBudgetResult(possibleResult)) {
        throw new Error('Facts prompt budgeter returned an invalid result');
      }

      const budgetResult = possibleResult;

      const promptFacts = budgetResult.promptFacts;
      const promptFactsRecord = buildPromptFactsRecord(promptFacts);
      const promptContext: AgentContext = {
        bullets: [],
        facts: promptFactsRecord,
        glossaryContext: baseContext.glossaryContext,
      };

      const tokenBreakdown = this.contextBuilder.getFactsTokenBreakdown(promptContext, recentText);
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
      this.logger.log(runtime.eventId, 'facts', logLevel, logMessage, { seq: runtime.factsLastSeq });

      this.metrics.recordTokens(
        runtime.eventId,
        'facts',
        tokenBreakdown.total,
        budgetStatus.warning,
        budgetStatus.critical,
        budgetResult.metrics
      );

      await session.sendMessage(recentText, {
        recentText,
        facts: promptFacts,
        glossaryContext: baseContext.glossaryContext,
      });

      const mergeTimestamp = new Date().toISOString();
      for (const operation of budgetResult.mergeOperations) {
        runtime.factsStore.recordMerge(operation.representativeKey, operation.memberKeys, mergeTimestamp);
      }

      runtime.factsStore.applyConfidenceAdjustments(budgetResult.factAdjustments);
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
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
