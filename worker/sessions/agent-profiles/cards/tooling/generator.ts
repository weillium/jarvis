import type { RealtimeMessageContext, RealtimeModelResponseDTO } from '../../../session-adapters/types';
import type { RealtimeCardDTO } from '../../../../types';
import { getPolicy } from '../../../../policies';
import { createCardGenerationUserPrompt } from '../../../../prompts';
import { formatResearchSummaryForPrompt } from '../../../../lib/text/llm-prompt-formatting';
import { mapCardPayload, safeJsonParse } from '../../../session-adapters/shared/payload-utils';
import type { OpenAIService } from '../../../../services/openai-service';
import { isRecord } from '../../../../lib/context-normalization';

export interface CardGenerationInput {
  recentTranscript: string;
  previousCards: RealtimeCardDTO[];
  messageContext?: RealtimeMessageContext;
  sourceSeq?: number;
}

export interface CardGenerationResult {
  rawResponse?: RealtimeModelResponseDTO;
  generatedCards: RealtimeCardDTO[];
}

export interface CardGenerator {
  generate(input: CardGenerationInput): Promise<CardGenerationResult>;
}

interface CardGeneratorDeps {
  openaiService: OpenAIService;
  configModel?: string;
  eventId?: string;
}

const MAX_CARD_HISTORY = 10;

export class PromptCardGenerator implements CardGenerator {
  constructor(private readonly deps: CardGeneratorDeps) {}

  async generate(input: CardGenerationInput): Promise<CardGenerationResult> {
    const policy = getPolicy('cards', 1);
    const rawBullets = input.messageContext?.bullets;
    const bullets = Array.isArray(rawBullets) ? rawBullets : [];
    const bulletSummary = formatResearchSummaryForPrompt(
      bullets.map((text) => ({ text })),
      2048
    );

    const factsRecord = input.messageContext?.facts ?? {};
    const factsJson =
      typeof factsRecord === 'string'
        ? factsRecord
        : JSON.stringify(factsRecord ?? {}, null, 2);

    const glossaryContext =
      typeof input.messageContext?.glossaryContext === 'string'
        ? input.messageContext?.glossaryContext
        : '';

    const recentCardsSummary = input.previousCards
      .slice(-MAX_CARD_HISTORY)
      .map(
        (card) =>
          `- [${card.kind}] ${card.title ?? 'untitled'} (type: ${card.card_type}, seq: ${card.source_seq})`
      )
      .join('\n');

    const userPrompt = createCardGenerationUserPrompt(
      input.recentTranscript,
      bulletSummary,
      factsJson,
      `${glossaryContext}\n\nRecent Cards:\n${recentCardsSummary || 'None'}`
    );

    const response = await this.deps.openaiService.createChatCompletion(
      [
        { role: 'system', content: policy },
        { role: 'user', content: userPrompt },
      ],
      {
        responseFormat: { type: 'json_object' },
        temperature: 0.6,
      }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { rawResponse: { raw: null }, generatedCards: [] };
    }

    const parsed = safeJsonParse<unknown>(content);
    if (!parsed) {
      return { rawResponse: { raw: content }, generatedCards: [] };
    }

    const generatedCards: RealtimeCardDTO[] = [];

    if (Array.isArray(parsed)) {
      parsed.forEach((item: unknown) => {
        const card = mapCardPayload(item);
        if (card) {
          generatedCards.push(card);
        }
      });
    } else if (isRecord(parsed) && Array.isArray(parsed.cards)) {
      parsed.cards.forEach((item: unknown) => {
        const card = mapCardPayload(item);
        if (card) {
          generatedCards.push(card);
        }
      });
    } else {
      const singleCard = mapCardPayload(parsed);
      if (singleCard) {
        generatedCards.push(singleCard);
      }
    }

    generatedCards.forEach((card) => {
      card.source_seq = card.source_seq ?? input.sourceSeq ?? 0;
      if (!card.card_type) {
        card.card_type = 'text';
      }
    });

    return {
      rawResponse: { raw: parsed },
      generatedCards,
    };
  }
}

export type CardGeneratorFactory = (deps: CardGeneratorDeps) => CardGenerator;

