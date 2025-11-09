import type OpenAI from 'openai';
import type { RealtimeCardDTO } from '../../types';
import type { RealtimeMessageContext, RealtimeSessionConfig } from '../session-adapters';
import { StatelessAgentSession } from '../session-adapters';
import type {
  CardGenerator,
  CardGeneratorFactory,
} from '../agent-profiles/cards/card-generator';
import type { CardsSessionFactoryDeps } from '../agent-profiles/cards';

const MAX_CARD_HISTORY = 50;

export class CardsStatelessSession extends StatelessAgentSession {
  private readonly generator: CardGenerator;
  private previousCards: RealtimeCardDTO[] = [];

  constructor(
    openai: OpenAI,
    config: RealtimeSessionConfig,
    generatorFactory: CardGeneratorFactory,
    deps: CardsSessionFactoryDeps
  ) {
    super(openai, config, { agentType: 'cards', logLabel: 'cards' });
    this.generator = generatorFactory({
      openaiService: deps.openaiService,
      configModel: config.model,
      eventId: config.eventId,
    });
  }

  override async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    this.log('log', 'Stateless cards session generating output');
    const sourceSeq = context?.sourceSeq;
    const result = await this.generator.generate({
      recentTranscript: message,
      previousCards: this.previousCards,
      messageContext: context,
      sourceSeq,
    });

    if (result.rawResponse) {
      this.emitEvent('response', result.rawResponse);
    }

    if (result.generatedCards.length > 0) {
      result.generatedCards.forEach((card) => {
        if (card.source_seq === undefined && sourceSeq !== undefined) {
          card.source_seq = sourceSeq;
        }
        this.emitEvent('card', card);
      });
      const updatedCards = this.mergeCardHistory(this.previousCards, result.generatedCards);
      this.previousCards = updatedCards.slice(-MAX_CARD_HISTORY);
    }
  }

  private mergeCardHistory(
    existing: RealtimeCardDTO[],
    incoming: RealtimeCardDTO[]
  ): RealtimeCardDTO[] {
    const combined: RealtimeCardDTO[] = [...existing];

    for (const card of incoming) {
      const seq = card.source_seq ?? 0;
      if (seq !== 0) {
        const existingIndex = combined.findIndex((item) => item.source_seq === seq);
        if (existingIndex >= 0) {
          combined[existingIndex] = card;
          continue;
        }
      }
      combined.push(card);
    }

    return combined;
  }
}

