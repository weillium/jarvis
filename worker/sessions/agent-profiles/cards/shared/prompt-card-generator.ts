import type { RealtimeMessageContext, RealtimeModelResponseDTO } from '../../../session-adapters/types';
import type { RealtimeCardDTO } from '../../../../types';
import { getPolicy } from '../../../../policies';
import { createCardGenerationUserPrompt } from '../../../../prompts';
import { mapCardPayload } from '../../../session-adapters/shared/payload-utils';
import type { OpenAIService } from '../../../../services/openai-service';
import { isRecord } from '../../../../lib/context-normalization';
import { safeJsonParse } from '../../../session-adapters/shared/payload-utils';
import { executeJsonPrompt } from '../../shared/json-prompt-runner';

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

export interface CardGeneratorDeps {
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

    const supportingFactsSummary =
      supportingContext?.facts && supportingContext.facts.length > 0
        ? supportingContext.facts
            .map((fact) => {
              const confidence =
                typeof fact.confidence === 'number'
                  ? fact.confidence.toFixed(2)
                  : fact.confidence ?? 'n/a';
              const value =
                typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value);
              return `- ${fact.key} (confidence ${confidence}): ${value}`;
            })
            .join('\n')
        : '';

    const contextChunks =
      supportingContext?.contextChunks && supportingContext.contextChunks.length > 0
        ? supportingContext.contextChunks
        : [];

    const contextChunksSummary =
      contextChunks.length > 0
        ? contextChunks
            .map((chunk, index) => {
              const similarityLabel =
                typeof chunk.similarity === 'number'
                  ? chunk.similarity.toFixed(3)
                  : String(chunk.similarity ?? 'n/a');
              return `Chunk ${index + 1} (similarity ${similarityLabel}, tokens ${chunk.tokenCount}):\n${chunk.text}`;
            })
            .join('\n\n')
        : '';

    const conceptWindowEntries =
      supportingContext?.conceptWindow && supportingContext.conceptWindow.length > 0
        ? supportingContext.conceptWindow
        : [];

    const conceptWindowSummary =
      conceptWindowEntries.length > 0
        ? conceptWindowEntries
            .map((entry, index) => {
              const ageLabel =
                typeof entry.lastMentionAgoMs === 'number'
                  ? this.formatDurationShort(entry.lastMentionAgoMs)
                  : 'timing unknown';
              return `#${index + 1} ${entry.conceptLabel} (score ${entry.score.toFixed(
                2
              )}, occurrences ${entry.occurrences}, source ${entry.matchSource}${
                entry.lastMentionSeq !== undefined ? `, seq ${entry.lastMentionSeq}` : ''
              }, last mention ${ageLabel})`;
            })
            .join('\n')
        : '';

    const recentCardsSummary = [
      input.previousCards
        .slice(-MAX_CARD_HISTORY)
        .map(
          (card) =>
            `- [${
              card.template_label ?? card.template_id ?? 'Card'
            }] ${card.title ?? 'untitled'} (type: ${card.card_type}, seq: ${card.source_seq})`
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

    const audienceProfile =
      typeof input.messageContext?.audienceProfile === 'string'
        ? input.messageContext.audienceProfile
        : supportingContext && 'audienceProfile' in supportingContext
          ? (supportingContext as { audienceProfile?: string }).audienceProfile
          : undefined;

    const userPrompt = createCardGenerationUserPrompt({
      transcriptSegment: input.recentTranscript,
      factsSnapshot: factsJson || 'No facts snapshot available.',
      glossaryContext: undefined,
      supportingFacts: supportingFactsSummary,
      supportingGlossary,
      transcriptBullets: contextBullets,
      retrievedContext: contextChunksSummary,
      conceptWindow: conceptWindowSummary,
      recentCards: recentCardsSummary || 'None',
      audienceProfile,
      templatePlan: input.messageContext?.templatePlan,
      conceptFocus,
    });

    // console.log('[cards][debug] card generation prompt', {
    //   transcriptLength: input.recentTranscript.length,
    //   bulletsCount: bullets.length,
    //   previousCards: input.previousCards.length,
    //   factsLength: factsJson.length,
    //   supportingGlossaryLength: supportingGlossary.length,
    //   supportingGlossaryEntries:
    //     supportingContext?.glossaryEntries && supportingContext.glossaryEntries.length > 0
    //       ? supportingContext.glossaryEntries.length
    //       : 0,
    //   promptPreview: userPrompt.slice(0, 500),
    //   eventId: this.deps.eventId,
    // });

    const { content, parsed } = await executeJsonPrompt({
      openaiService: this.deps.openaiService,
      model: this.deps.configModel,
      systemPrompt: policy,
      userPrompt,
    });

    if (!content) {
      // console.log('[cards][debug] model returned empty content', { eventId: this.deps.eventId });
      return { rawResponse: { raw: null }, generatedCards: [] };
    }

    // console.log('[cards][debug] raw card content preview', {
    //   eventId: this.deps.eventId,
    //   contentPreview: content.slice(0, 500),
    // });

    const payloadSource =
      parsed ?? (content ? this.normalizeCardPayloadContent(content) : content);

    // console.log('[cards][debug] payload source preview', {
    //   eventId: this.deps.eventId,
    //   parsed: parsed !== null,
    //   payloadPreview:
    //     typeof payloadSource === 'string'
    //       ? payloadSource.slice(0, 500)
    //       : JSON.stringify(payloadSource).slice(0, 500),
    // });

    const generatedCards: RealtimeCardDTO[] = [];

    if (Array.isArray(payloadSource)) {
      payloadSource.forEach((item) => {
        const card = mapCardPayload(item);
        if (card) {
          generatedCards.push(card);
        }
      });
    } else if (isRecord(payloadSource) && Array.isArray(payloadSource.cards)) {
      payloadSource.cards.forEach((item) => {
        const card = mapCardPayload(item);
        if (card) {
          generatedCards.push(card);
        }
      });
    } else {
      const singleCard = mapCardPayload(payloadSource);
      if (singleCard) {
        generatedCards.push(singleCard);
      }
    }

    for (const card of generatedCards) {
      card.source_seq = card.source_seq ?? input.sourceSeq ?? 0;
      if (!card.card_type) {
        card.card_type = 'text';
      }
      const plan = input.messageContext?.templatePlan;
      if (plan) {
        if (!card.template_id) {
          card.template_id = plan.templateId;
        }
        if (!card.template_label) {
          card.template_label = plan.metadata?.label ?? plan.templateId;
        }
      }
      if (card.card_type === 'text') {
        card.visual_request = null;
      }
    }

    if (generatedCards.length === 0) {
      // console.log('[cards][debug] model emitted no cards', {
      //   eventId: this.deps.eventId,
      //   sourceSeq: input.sourceSeq ?? 0,
      //   concept: input.messageContext?.concept?.label,
      // });
    }

    return {
      rawResponse: { raw: payloadSource },
      generatedCards,
    };
  }

  private formatDurationShort(ms: number): string {
    if (ms < 1000) {
      return '<1s ago';
    }
    const seconds = Math.round(ms / 1000);
    if (seconds < 120) {
      return `${seconds}s ago`;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 120) {
      return `${minutes}m ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 48) {
      return `${hours}h ago`;
    }
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  private normalizeCardPayloadContent(content: string): unknown {
    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }

    const directlyParsed = safeJsonParse<unknown>(trimmed);
    if (directlyParsed !== null) {
      return directlyParsed;
    }

    const fragments = trimmed
      .split(/\n+/)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0);

    if (fragments.length <= 1) {
      return null;
    }

    const parsedFragments: unknown[] = [];
    for (const fragment of fragments) {
      const parsed = safeJsonParse<unknown>(fragment);
      if (parsed === null) {
        return null;
      }
      parsedFragments.push(parsed);
    }

    // console.log('[cards][debug] normalized newline-delimited card payload', {
    //   eventId: this.deps.eventId,
    //   fragmentCount: parsedFragments.length,
    // });

    return parsedFragments;
  }
}


