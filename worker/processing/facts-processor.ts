import type { EventRuntime, Fact } from '../types';
import type { FactsStore } from '../state/facts-store';
import type { AgentContext, ContextBuilder } from '../context/context-builder';
import type { Logger } from '../services/observability/logger';
import type { MetricsCollector } from '../services/observability/metrics-collector';
import type { CheckpointManager } from '../services/observability/checkpoint-manager';
import type { AgentRealtimeSession } from '../sessions/session-adapters';
import { budgetFactsPrompt } from '../runtime/facts/prompt-budgeter';
import type { FactsPromptBudgetResult } from '../runtime/facts/prompt-budgeter';
import type { ConfidenceAdjustment } from '../runtime/facts/prompt-budgeter';
import { checkBudgetStatus, countTokens, formatTokenBreakdown } from '../lib/text/token-counter';

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

      const budgetResult: FactsPromptBudgetResult = budgetFactsPrompt({
        facts: allFacts,
        recentTranscript: recentText,
        totalBudgetTokens: 2048,
        transcriptTokens: recentTextTokens,
        glossaryTokens,
      });

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

      const logMessage = `${logPrefix} Facts Agent (seq ${runtime.factsLastSeq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr} | selected ${budgetResult.metrics.selected}/${budgetResult.metrics.totalFacts} (summary ${budgetResult.metrics.summary})`;
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

      const factsStore = runtime.factsStore as FactsStore & {
        applyConfidenceAdjustments: (adjustments: ConfidenceAdjustment[]) => void;
      };
      factsStore.applyConfidenceAdjustments(budgetResult.confidenceAdjustments);

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
