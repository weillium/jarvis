import { EventRuntime, TranscriptChunk } from '../types';
import { ContextBuilder, AgentContext } from '../context/context-builder';
import { SupabaseService } from '../services/supabase-service';
import { OpenAIService } from '../services/openai-service';
import { Logger } from '../monitoring/logger';
import { MetricsCollector } from '../monitoring/metrics-collector';
import { CheckpointManager } from '../monitoring/checkpoint-manager';
import { RealtimeSession } from '../sessions/realtime-session';
import { getPolicy } from '../policies';
import { createCardGenerationUserPrompt } from '../prompts';
import { checkBudgetStatus, formatTokenBreakdown } from '../utils/token-counter';

type DetermineCardTypeFn = (card: any, transcriptText: string) => 'text' | 'text_visual' | 'visual';

export class CardsProcessor {
  constructor(
    private contextBuilder: ContextBuilder,
    private supabase: SupabaseService,
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
        runtime.agentId,
        'cards',
        runtime.cardsLastSeq
      );
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'cards', 'error', `Error processing chunk: ${error.message}`, { seq: chunk.seq });
    }
  }

  private async generateCardFallback(
    runtime: EventRuntime,
    chunk: TranscriptChunk,
    context: AgentContext
  ): Promise<void> {
    const policy = getPolicy('cards', 1);

    const userPrompt = createCardGenerationUserPrompt(
      chunk.text,
      context.bullets,
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

      const card = JSON.parse(cardJson);
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

      await this.supabase.insertAgentOutput({
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
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'cards', 'error', `Error generating card: ${error.message}`, { seq: chunk.seq });
    }
  }
}
