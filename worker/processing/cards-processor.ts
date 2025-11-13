import type { EventRuntime, TranscriptChunk, CardRecord, GlossaryEntry } from '../types';
import type { ContextBuilder } from '../context/context-builder';
import type { Logger } from '../services/observability/logger';
import type { MetricsCollector } from '../services/observability/metrics-collector';
import type { CheckpointManager } from '../services/observability/checkpoint-manager';
import type { AgentRealtimeSession } from '../sessions/session-adapters';
import { checkBudgetStatus, formatTokenBreakdown } from '../lib/text/token-counter';
import { TemplateOrchestrator } from '../sessions/agent-profiles/cards/pipeline/orchestrator';
import type { TemplatePlan } from '../sessions/agent-profiles/cards/templates/types';

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
  private readonly templateOrchestrator: TemplateOrchestrator;

  constructor(
    private contextBuilder: ContextBuilder,
    private logger: Logger,
    private metrics: MetricsCollector,
    private checkpointManager: CheckpointManager,
    templateOrchestrator?: TemplateOrchestrator
  ) {
    this.templateOrchestrator = templateOrchestrator ?? new TemplateOrchestrator();
  }

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

      let templatePlan: TemplatePlan | undefined;
      if (triggerContext) {
        const planResult = this.templateOrchestrator.plan(triggerContext);
        if (planResult) {
          templatePlan = planResult.plan;
          this.logger.log(runtime.eventId, 'cards', 'log', '[template] plan selected', {
            templateId: planResult.plan.templateId,
            reason: planResult.plan.metadata.eligibilityReason,
            priority: planResult.plan.metadata.priority,
          });
        } else {
          this.logger.log(runtime.eventId, 'cards', 'log', '[template] no eligible template', {
            conceptId: triggerContext.conceptId,
            conceptLabel: triggerContext.conceptLabel,
          });
        }
      }

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
        templatePlan,
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
