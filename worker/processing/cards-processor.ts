import type { EventRuntime, TranscriptChunk, CardRecord, GlossaryEntry } from '../types';
import type { ContextBuilder, AgentContext } from '../context/context-builder';
import type { OpenAIService } from '../services/openai-service';
import type { Logger } from '../monitoring/logger';
import type { MetricsCollector } from '../monitoring/metrics-collector';
import type { CheckpointManager } from '../monitoring/checkpoint-manager';
import type { AgentRealtimeSession } from '../sessions/session-adapters';
import { getPolicy } from '../policies';
import { createCardGenerationUserPrompt } from '../prompts';
import { checkBudgetStatus, formatTokenBreakdown } from '../utils/token-counter';
import type { AgentOutputsRepository } from '../services/supabase/agent-outputs-repository';
import { isRecord } from '../lib/context-normalization';
import { formatResearchSummaryForPrompt } from '../lib/text/llm-prompt-formatting';

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

interface GeneratedCardPayload {
  card_type?: 'text' | 'text_visual' | 'visual';
  title?: string;
  body?: string | null;
  label?: string;
  image_url?: string | null;
  source_seq?: number;
  [key: string]: unknown;
}

type DetermineCardTypeFn = (
  card: GeneratedCardPayload,
  transcriptText: string
) => 'text' | 'text_visual' | 'visual';

export class CardsProcessor {
  constructor(
    private contextBuilder: ContextBuilder,
    private readonly agentOutputs: AgentOutputsRepository,
    private openai: OpenAIService,
    private logger: Logger,
    private metrics: MetricsCollector,
    private checkpointManager: CheckpointManager,
    private determineCardType: DetermineCardTypeFn
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

      await this.generateCardFallback(runtime, chunk, context, triggerContext);

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

  private async generateCardFallback(
    runtime: EventRuntime,
    chunk: TranscriptChunk,
    context: AgentContext,
    triggerContext?: CardTriggerContext
  ): Promise<void> {
    const policy = getPolicy('cards', 1);

    const joinedBullets = formatResearchSummaryForPrompt(
      context.bullets.map((text) => ({ text })),
      2048
    );

    const supportingRecentCards = triggerContext?.supportingContext.recentCards ?? [];
    const recentCardsSummary =
      supportingRecentCards
        .map((card) => {
          const title = typeof card.metadata?.title === 'string' ? card.metadata.title : 'untitled';
          return `- ${card.conceptLabel} (${card.cardType ?? 'text'}) @ seq ${card.sourceSeq} — ${title}`;
        })
        .join('\n') || 'None';

    const factsForPrompt =
      triggerContext?.supportingContext.facts.length
        ? triggerContext.supportingContext.facts
        : Object.entries(context.facts).map(([key, value]) => ({
            key,
            value,
            confidence: 0.5,
          }));

    const userPrompt = createCardGenerationUserPrompt(
      chunk.text,
      joinedBullets,
      JSON.stringify(factsForPrompt, null, 2),
      [
        context.glossaryContext,
        triggerContext?.supportingContext.glossaryEntries
          .map((entry) => `- ${entry.term}: ${entry.definition ?? ''}`)
          .join('\n') ?? '',
        triggerContext?.supportingContext.contextBullets.join('\n') ?? '',
        `Recent Cards:\n${recentCardsSummary}`,
      ]
        .filter(Boolean)
        .join('\n'),
      triggerContext
        ? `Focus concept: ${triggerContext.conceptLabel} (id: ${triggerContext.conceptId}, source: ${triggerContext.matchSource}).`
        : undefined
    );

    try {
      const response = await this.openai.createChatCompletion(
        [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.7,
        }
      );

      const cardJson = response.choices[0]?.message?.content;
      if (!cardJson) return;

      const parsedCard: unknown = JSON.parse(cardJson);
      if (!isRecord(parsedCard)) {
        this.logger.log(runtime.eventId, 'cards', 'warn', 'Card payload missing expected object shape', { seq: chunk.seq });
        return;
      }

      const card: GeneratedCardPayload = { ...parsedCard };
      card.source_seq = chunk.seq;

      if (triggerContext) {
        (card as GeneratedCardPayload & { concept_id?: string; concept_label?: string }).concept_id =
          triggerContext.conceptId;
        (card as GeneratedCardPayload & { concept_id?: string; concept_label?: string }).concept_label =
          triggerContext.conceptLabel;
      }

      if (!card.card_type || !['text', 'text_visual', 'visual'].includes(card.card_type)) {
        card.card_type = this.determineCardType(card, chunk.text);
      }

      if (card.card_type === 'visual') {
        if (!card.label) card.label = card.title || 'Image';
        if (!card.body) card.body = null;
      } else if (card.card_type === 'text_visual') {
        if (!card.body) card.body = card.title || 'Definition';
      } else {
        if (!card.body) card.body = card.title || 'Definition';
        card.image_url = null;
      }

      await this.agentOutputs.insertAgentOutput({
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        agent_type: 'cards',
        for_seq: chunk.seq,
        type: 'card',
        payload: card,
      });

      if (triggerContext && chunk.seq) {
        runtime.cardsStore.add({
          conceptId: triggerContext.conceptId,
          conceptLabel: triggerContext.conceptLabel,
          cardType: card.card_type ?? 'text',
          sourceSeq: chunk.seq,
          createdAt: Date.now(),
          metadata: {
            title: typeof card.title === 'string' ? card.title : undefined,
            body: card.body ?? null,
            label: card.label ?? null,
            imageUrl: card.image_url ?? null,
          },
        });
      }
      if (chunk.seq) {
        runtime.pendingCardConcepts.delete(chunk.seq);
      }

      this.logger.log(
        runtime.eventId,
        'cards',
        'log',
        `Generated card for seq ${chunk.seq} (event: ${runtime.eventId}, type: ${card.card_type})`,
        { seq: chunk.seq }
      );
      // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }
}
