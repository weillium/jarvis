import type { EventRuntime } from '../types';
import type { ContextBuilder } from '../context/context-builder';
import type { Logger } from '../monitoring/logger';
import type { MetricsCollector } from '../monitoring/metrics-collector';
import type { CheckpointManager } from '../monitoring/checkpoint-manager';
import type { AgentRealtimeSession } from '../sessions/session-adapters';
import { checkBudgetStatus, formatTokenBreakdown } from '../utils/token-counter';

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
      const { context, recentText } = this.contextBuilder.buildFactsContext(runtime);
      const tokenBreakdown = this.contextBuilder.getFactsTokenBreakdown(context, recentText);
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

      const logMessage = `${logPrefix} Facts Agent (seq ${runtime.factsLastSeq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr}`;
      const counterKey = 'factsUsage';
      const currentCount = runtime.logCounters[counterKey] ?? 0;
      const shouldLog = logLevel !== 'log' || currentCount < 10;

      if (shouldLog) {
        if (logLevel === 'log') {
          runtime.logCounters[counterKey] = currentCount + 1;
        }
        this.logger.log(runtime.eventId, 'facts', logLevel, logMessage, { seq: runtime.factsLastSeq });
      }

      this.metrics.recordTokens(
        runtime.eventId,
        'facts',
        tokenBreakdown.total,
        budgetStatus.warning,
        budgetStatus.critical
      );

      await session.sendMessage(recentText, {
        recentText,
        facts: runtime.factsStore.getAll(),
        glossaryContext: context.glossaryContext,
      });

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
