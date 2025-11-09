import type { StatelessSessionProfile } from '../../../session-adapters/stateless/profile-types';
import type { RealtimeMessageContext } from '../../../session-adapters/types';
import type { RealtimeCardDTO } from '../../../../types';
import type { OpenAIService } from '../../../../services/openai-service';
import { PromptCardGenerator } from '../tooling';

const MAX_CARD_HISTORY = 50;
const CARD_HISTORY_KEY = 'cards:history';
const DEFAULT_STATELESS_MODEL = process.env.CARDS_STATELESS_MODEL ?? 'gpt-4o-mini';

interface CardsStatelessProfileDeps {
  openaiService: OpenAIService;
}

const mergeCardHistory = (
  existing: RealtimeCardDTO[],
  incoming: RealtimeCardDTO[]
): RealtimeCardDTO[] => {
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

  return combined.slice(-MAX_CARD_HISTORY);
};

export const cardsStatelessProfile: StatelessSessionProfile<CardsStatelessProfileDeps> = {
  agentType: 'cards',
  resolveModel: (hint) => hint ?? DEFAULT_STATELESS_MODEL,
  createHooks: ({ config, deps, emit, log, storage }) => {
    const generator = new PromptCardGenerator({
      openaiService: deps.openaiService,
      configModel: config.model ?? DEFAULT_STATELESS_MODEL,
      eventId: config.eventId,
    });

    const getHistory = (): RealtimeCardDTO[] =>
      storage.get<RealtimeCardDTO[]>(CARD_HISTORY_KEY) ?? [];

    const setHistory = (cards: RealtimeCardDTO[]): void => {
      storage.set(CARD_HISTORY_KEY, cards.slice(-MAX_CARD_HISTORY));
    };

    const buildGenerateInput = (
      message: string,
      context?: RealtimeMessageContext
    ) => ({
      recentTranscript: message,
      previousCards: getHistory(),
      messageContext: context,
      sourceSeq: context?.sourceSeq,
    });

    return {
      onSessionStart: ({ storage: sessionStorage }) => {
        sessionStorage.clear();
      },
      onSessionClose: ({ storage: sessionStorage }) => {
        sessionStorage.clear();
      },
      onSendMessage: async ({ message, context }) => {
        log('log', 'Stateless cards session generating output');

        const result = await generator.generate(buildGenerateInput(message, context));

        if (result.rawResponse) {
          emit('response', result.rawResponse);
        }

        if (result.generatedCards.length === 0) {
          return;
        }

        const sourceSeq = context?.sourceSeq;
        result.generatedCards.forEach((card) => {
          if (card.source_seq === undefined && sourceSeq !== undefined) {
            card.source_seq = sourceSeq;
          }
          if (!card.card_type) {
            card.card_type = 'text';
          }
          emit('card', card);
        });

        const updatedCards = mergeCardHistory(getHistory(), result.generatedCards);
        setHistory(updatedCards);
      },
    };
  },
};


