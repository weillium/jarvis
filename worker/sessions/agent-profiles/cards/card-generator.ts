import type { RealtimeMessageContext, RealtimeModelResponseDTO } from '../../session-adapters/types';
import type { RealtimeCardDTO } from '../../../types';
import { getPolicy } from '../../../policies';
import { createCardGenerationUserPrompt } from '../../../prompts';
import { formatResearchSummaryForPrompt } from '../../../lib/text/llm-prompt-formatting';
import { mapCardPayload, safeJsonParse } from '../../session-adapters/shared/payload-utils';
import type { OpenAIService } from '../../../services/openai-service';
import { isRecord } from '../../../lib/context-normalization';

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

    const supportingContext = input.messageContext?.supportingContext;

    const factsRecord = input.messageContext?.facts ?? {};
    const baseFactsJson =
      typeof factsRecord === 'string'
        ? factsRecord
        : JSON.stringify(factsRecord ?? {}, null, 2);

    const supportingFactsJson =
      supportingContext?.facts && supportingContext.facts.length > 0
        ? JSON.stringify(supportingContext.facts, null, 2)
        : '';

    const factsJson = [supportingFactsJson, baseFactsJson].filter(Boolean).join('\n');

    const glossaryContext =
      typeof input.messageContext?.glossaryContext === 'string'
        ? input.messageContext.glossaryContext
        : '';

    const supportingGlossary =
      supportingContext?.glossaryEntries && supportingContext.glossaryEntries.length > 0
        ? supportingContext.glossaryEntries
            .map((entry) => `- ${entry.term}: ${entry.definition ?? ''}`)
            .join('\n')
        : '';

    const contextBullets =
      supportingContext?.contextBullets && supportingContext.contextBullets.length > 0
        ? supportingContext.contextBullets.join('\n')
        : '';

    const recentCardsSummary = [
      input.previousCards
        .slice(-MAX_CARD_HISTORY)
        .map(
          (card) =>
            `- [${card.kind}] ${card.title ?? 'untitled'} (type: ${card.card_type}, seq: ${card.source_seq})`
        )
        .join('\n'),
      supportingContext?.recentCards && supportingContext.recentCards.length > 0
        ? supportingContext.recentCards
            .map(
              (card) =>
                `- [cached] ${card.conceptLabel} (${card.cardType ?? 'text'}) seq ${card.sourceSeq}`
            )
            .join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const conceptFocus = input.messageContext?.concept
      ? `Concept: ${input.messageContext.concept.label} (id: ${
          input.messageContext.concept.id
        }, source: ${input.messageContext.concept.source ?? 'unknown'})`
      : undefined;

    const combinedGlossary = [glossaryContext, supportingGlossary, contextBullets]
      .filter(Boolean)
      .join('\n');

    const userPrompt = createCardGenerationUserPrompt(
      input.recentTranscript,
      bulletSummary,
      factsJson,
      `${combinedGlossary}\n\nRecent Cards:\n${recentCardsSummary || 'None'}`,
      conceptFocus
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
      parsed.forEach((item) => {
        const card = mapCardPayload(item);
        if (card) {
          generatedCards.push(card);
        }
      });
    } else if (isRecord(parsed) && Array.isArray(parsed.cards)) {
      parsed.cards.forEach((item) => {
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

