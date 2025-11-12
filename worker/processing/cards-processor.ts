import type { EventRuntime, TranscriptChunk, CardRecord, GlossaryEntry } from '../types';
import type { ContextBuilder } from '../context/context-builder';
import type { Logger } from '../services/observability/logger';
import type { MetricsCollector } from '../services/observability/metrics-collector';
import type { CheckpointManager } from '../services/observability/checkpoint-manager';
import type { AgentRealtimeSession } from '../sessions/session-adapters';
import { checkBudgetStatus, formatTokenBreakdown } from '../lib/text/token-counter';

export interface CardTriggerSupportingContext {
  facts: Array<{ key: string; value: unknown; confidence: number }>;
  recentCards: CardRecord[];
  glossaryEntries: Array<Pick<GlossaryEntry, 'term' | 'definition'>>;
  contextBullets: string[];
}

export interface CardTriggerContext {
  conceptId: string;
  conceptLabel: string;
  matchSource: 'glossary' | 'fact' | 'transcript';
  supportingContext: CardTriggerSupportingContext;
}

export class CardsProcessor {
  constructor(
    private contextBuilder: ContextBuilder,
    private logger: Logger,
    private metrics: MetricsCollector,
    private checkpointManager: CheckpointManager
  ) {}

  async process(
    runtime: EventRuntime,
    chunk: TranscriptChunk,
    session: AgentRealtimeSession | undefined,
    sessionId: string | undefined,
    triggerContext?: CardTriggerContext
  ): Promise<void> {
    if (!session || !sessionId) {
      this.logger.log(runtime.eventId, 'cards', 'warn', `No session for event ${runtime.eventId}`);
      return;
    }

    try {
      const context = this.contextBuilder.buildCardsContext(runtime, chunk.text);
      const tokenBreakdown = this.contextBuilder.getCardsTokenBreakdown(context, chunk.text);
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

      const logMessage = `${logPrefix} Cards Agent (seq ${chunk.seq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr}`;
      this.logger.log(runtime.eventId, 'cards', logLevel, logMessage, { seq: chunk.seq });

      this.metrics.recordTokens(
        runtime.eventId,
        'cards',
        tokenBreakdown.total,
        budgetStatus.warning,
        budgetStatus.critical
      );

      const messageContext = {
        ...context,
        recentText: chunk.text,
        sourceSeq: chunk.seq,
        concept: triggerContext
          ? {
              id: triggerContext.conceptId,
              label: triggerContext.conceptLabel,
              source: triggerContext.matchSource,
            }
          : undefined,
        supportingContext: triggerContext?.supportingContext,
      };

      await session.sendMessage(chunk.text, messageContext);

      await this.checkpointManager.saveCheckpoint(
        runtime.eventId,
        'cards',
        runtime.cardsLastSeq
      );
      // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

}
