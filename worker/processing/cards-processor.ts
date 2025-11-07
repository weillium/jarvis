import type { EventRuntime, TranscriptChunk } from '../types';
import type { ContextBuilder, AgentContext } from '../context/context-builder';
import type { OpenAIService } from '../services/openai-service';
import type { Logger } from '../monitoring/logger';
import type { MetricsCollector } from '../monitoring/metrics-collector';
import type { CheckpointManager } from '../monitoring/checkpoint-manager';
import type { RealtimeSession } from '../sessions/realtime-session';
import { getPolicy } from '../policies';
import { createCardGenerationUserPrompt } from '../prompts';
import { checkBudgetStatus, formatTokenBreakdown } from '../utils/token-counter';
import type { AgentOutputsRepository } from '../services/supabase/agent-outputs-repository';
import { isRecord } from '../lib/context-normalization';
import { formatResearchSummaryForPrompt } from '../lib/text/llm-prompt-formatting';

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
    session: RealtimeSession | undefined,
    sessionId: string | undefined
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

      await session.sendMessage(chunk.text, context);

      await this.generateCardFallback(runtime, chunk, context);

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
    context: AgentContext
  ): Promise<void> {
    const policy = getPolicy('cards', 1);

    const joinedBullets = formatResearchSummaryForPrompt(
      context.bullets.map((text) => ({ text })),
      2048
    );

    const userPrompt = createCardGenerationUserPrompt(
      chunk.text,
      joinedBullets,
      JSON.stringify(context.facts, null, 2),
      context.glossaryContext
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
