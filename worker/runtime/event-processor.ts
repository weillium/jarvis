import { randomUUID } from 'node:crypto';
import type {
  EventRuntime,
  RealtimeCardDTO,
  RealtimeFactDTO,
  TranscriptChunk,
  Fact,
  GlossaryEntry,
} from '../types';
import type { FactsStore } from '../state/facts-store';
import type {
  CardsProcessor,
  CardTriggerContext,
  CardSupportingContextChunk,
  CardConceptWindowEntry,
} from '../processing/cards-processor';
import type { FactsProcessor } from '../processing/facts-processor';
import type { TranscriptProcessor } from '../processing/transcript-processor';
import type { AgentOutputsRepository } from '../services/supabase/agent-outputs-repository';
import type { CardsRepository } from '../services/supabase/cards-repository';
import type { FactsRepository } from '../services/supabase/facts-repository';
import type { FactRecord } from '../services/supabase/types';
import {
  extractConcepts,
  normalizeConcept,
  type ConceptCandidate,
} from '../lib/text/concept-extractor';
import { CARD_SALIENCE_THRESHOLD, computeCardSalience } from './cards/salience';
import type { VectorSearchService } from '../context/vector-search';
import type {
  CardImageService,
  CardVisualRequest,
} from '../sessions/agent-profiles/cards/runtime-tooling/card-image-service';
import { countTokens, truncateToTokenBudget } from '../lib/text/token-counter';
import {
  checkCardRateLimit,
  recordCardFire,
} from './cards/rate-limit';
import {
  validateRealtimeFact,
  factsAreEquivalent,
  shouldTreatAsDuplicate,
  shouldTreatAsMerge,
  computeIngestSimilarity,
} from './facts/input-guards';
import { normalizeFactValue } from './facts/value-normalizer';
import { findBestMatchingFact } from './facts/duplicate-detector';
import { registerAliasKey, resolveAliasKey } from './facts/alias-map';
import type { FactAliasMap } from './facts/alias-map';

type CardType = RealtimeCardDTO['card_type'];

interface DetermineCardPayload extends Record<string, unknown> {
  card_type?: unknown;
  title?: string;
  body?: string | null;
  label?: string | null;
  image_url?: string | null;
  visual_request?: CardVisualRequest | null;
  source_seq?: number;
  concept_id?: string;
  concept_label?: string;
  template_id?: string | null;
  template_label?: string | null;
}

interface MutableCardPayload extends DetermineCardPayload {
  kind?: string;
}

interface TranscriptPayload extends Record<string, unknown> {
  text: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTranscriptPayload = (value: unknown): value is TranscriptPayload =>
  isRecord(value) && typeof value.text === 'string';

const isRealtimeCardType = (value: unknown): value is CardType =>
  value === 'text' || value === 'text_visual' || value === 'visual';

const isMutableCardPayload = (value: unknown): value is MutableCardPayload =>
  isRecord(value);

const isRealtimeFact = (value: unknown): value is RealtimeFactDTO =>
  isRecord(value) && typeof value.key === 'string';

const isCardVisualRequest = (value: unknown): value is CardVisualRequest => {
  if (!isRecord(value)) {
    return false;
  }
  const strategy = value.strategy;
  const instructions = value.instructions;
  const sourceUrl = value.source_url;

  if (strategy !== 'fetch' && strategy !== 'generate') {
    return false;
  }

  if (typeof instructions !== 'string' || instructions.trim().length === 0) {
    return false;
  }

  if (sourceUrl !== undefined && sourceUrl !== null && typeof sourceUrl !== 'string') {
    return false;
  }

  return true;
};

type DetermineCardTypeFn = (card: DetermineCardPayload) => CardType;

export class EventProcessor {
  private readonly CARD_WINDOW_CHUNKS = Number(process.env.CARDS_CONCEPT_WINDOW ?? 3);
  private readonly CARD_MIN_CHUNKS = Number(process.env.CARDS_CONCEPT_MIN_CHUNKS ?? 2);
  private readonly CARD_FRESHNESS_MS =
    Number(process.env.CARDS_CONCEPT_FRESHNESS_MS ?? 5 * 60 * 1000);
  private readonly CARD_FACT_LIMIT = Number(process.env.CARDS_SUPPORTING_FACTS_LIMIT ?? 5);
  private readonly CARD_CONTEXT_LIMIT = Number(process.env.CARDS_SUPPORTING_CONTEXT_LIMIT ?? 5);
  private readonly CARD_RECENT_LIMIT = Number(process.env.CARDS_SUPPORTING_RECENT_LIMIT ?? 5);
  private readonly CARD_CONTEXT_CHUNK_TOP_K = Number(
    process.env.CARDS_CONTEXT_CHUNK_TOP_K ?? 5
  );
  private readonly CARD_CONTEXT_CHUNK_TOKEN_BUDGET = Number(
    process.env.CARDS_CONTEXT_CHUNK_TOKEN_BUDGET ?? 600
  );
  private readonly CARD_CONTEXT_CHUNK_PER_ITEM_BUDGET = Number(
    process.env.CARDS_CONTEXT_CHUNK_PER_ITEM_BUDGET ?? 220
  );
  private readonly CARD_CONCEPT_WINDOW_MAX = Number(
    process.env.CARDS_CONCEPT_WINDOW_MAX ?? 6
  );

  constructor(
    private readonly cardsProcessor: CardsProcessor,
    private readonly factsProcessor: FactsProcessor,
    private readonly transcriptProcessor: TranscriptProcessor,
    private readonly agentOutputs: AgentOutputsRepository,
    private readonly cardsRepository: CardsRepository,
    private readonly factsRepository: FactsRepository,
    private readonly determineCardType: DetermineCardTypeFn,
    private readonly vectorSearch: VectorSearchService,
    private readonly cardImageService?: CardImageService
  ) {}

  async handleTranscript(runtime: EventRuntime, transcript: unknown): Promise<void> {
    if (!isTranscriptPayload(transcript)) {
      throw new TypeError('Invalid transcript payload: missing text');
    }

    const chunk = this.transcriptProcessor.convertToChunk(transcript);
    await this.processTranscriptChunk(runtime, chunk);
  }

  attachSessionHandlers(runtime: EventRuntime): void {
    if (runtime.cardsSession && runtime.cardsSession !== runtime.cardsHandlerSession) {
      runtime.cardsSession.on('card', (card: RealtimeCardDTO) => {
        void this.handleCardResponse(runtime, card);
      });
      runtime.cardsHandlerSession = runtime.cardsSession;
    }

    if (runtime.factsSession && runtime.factsSession !== runtime.factsHandlerSession) {
      runtime.factsSession.on('facts', (facts: RealtimeFactDTO[]) => {
        void this.handleFactsResponse(runtime, facts);
      });
      runtime.factsHandlerSession = runtime.factsSession;
    }
  }

  cleanup(eventId: string, runtime: EventRuntime): void {
    runtime.transcriptHandlerSession = undefined;
    runtime.cardsHandlerSession = undefined;
    runtime.factsHandlerSession = undefined;
  }

  private async processTranscriptChunk(runtime: EventRuntime, chunk: TranscriptChunk): Promise<void> {
    runtime.ringBuffer.add(chunk);

    if (!chunk.final) {
      return;
    }

    if (!chunk.seq || chunk.seq === 0) {
      const nextSeq = runtime.cardsLastSeq + 1;
      if (chunk.transcript_id) {
        await this.transcriptProcessor.ensureSequenceNumber(chunk.transcript_id, nextSeq);
      }
      chunk.seq = nextSeq;
    }

    runtime.transcriptLastSeq = Math.max(runtime.transcriptLastSeq, chunk.seq);
    runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, chunk.seq);
    runtime.factsLastSeq = Math.max(runtime.factsLastSeq, chunk.seq);

    if (runtime.enabledAgents.cards && runtime.cardsSession) {
      const rateLimitCheck = checkCardRateLimit(runtime);
      if (!rateLimitCheck.allowed) {
        // console.log('[cards][debug] rate limit prevented card trigger', {
        //   eventId: runtime.eventId,
        //   reason: rateLimitCheck.reason,
        // });
        return;
      }

      // console.log('[cards][debug] evaluating card trigger', {
      //   eventId: runtime.eventId,
      //   lastSeq: chunk.seq,
      // });
      const triggerContext = await this.evaluateCardTrigger(runtime);
      if (triggerContext) {
        // console.log('[cards][debug] card trigger selected', {
        //   eventId: runtime.eventId,
        //   conceptId: triggerContext.conceptId,
        //   conceptLabel: triggerContext.conceptLabel,
        // });
        if (chunk.seq) {
          runtime.pendingCardConcepts.set(chunk.seq, {
            conceptId: triggerContext.conceptId,
            conceptLabel: triggerContext.conceptLabel,
            triggeredAt: Date.now(),
          });
        }
        await this.cardsProcessor.process(
          runtime,
          chunk,
          runtime.cardsSession,
          runtime.cardsSessionId,
          triggerContext
        );
        recordCardFire(runtime);
      }
    } else if (!runtime.enabledAgents.cards) {
      // console.log('[cards][debug] cards agent disabled for runtime', {
      //   eventId: runtime.eventId,
      // });
    } else if (!runtime.cardsSession) {
      // console.log('[cards][debug] cards session missing; skipping trigger evaluation', {
      //   eventId: runtime.eventId,
      // });
    }

    if (runtime.enabledAgents.facts) {
      const pendingFactSources = runtime.pendingFactSources as Array<{
        seq: number;
        transcriptId: number;
      }>;

      if (chunk.seq && typeof chunk.transcript_id === 'number') {
        pendingFactSources.push({
          seq: chunk.seq,
          transcriptId: chunk.transcript_id,
        });

        if (pendingFactSources.length > 50) {
          pendingFactSources.shift();
        }
      }
      this.scheduleFactsUpdate(runtime);
    }
  }

  private scheduleFactsUpdate(runtime: EventRuntime): void {
    if (!runtime.enabledAgents.facts) {
      return;
    }

    if (runtime.factsProcessingPromise) {
      // Chain the next run after the inflight one completes to avoid overlapping prompts.
      runtime.factsProcessingPromise = runtime.factsProcessingPromise
        .then(() => this.factsProcessor.process(runtime, runtime.factsSession, runtime.factsSessionId))
        .catch((err: unknown) => {
          console.error('[facts] error in queued processing run', String(err));
        });
      return;
    }

    runtime.factsProcessingPromise = this.factsProcessor
      .process(runtime, runtime.factsSession, runtime.factsSessionId)
      .catch((err: unknown) => {
        console.error('[facts] error in processing run', String(err));
      })
      .finally(() => {
        runtime.factsProcessingPromise = undefined;
      });
  }

  private async evaluateCardTrigger(runtime: EventRuntime): Promise<CardTriggerContext | null> {
    const recentChunks = runtime.ringBuffer.getLastN(this.CARD_WINDOW_CHUNKS);
    if (recentChunks.length < this.CARD_MIN_CHUNKS) {
      return null;
    }

    const existingConceptIds = runtime.cardsStore.getConceptCache().map((entry) => entry.conceptId);
    const contextBullets = runtime.ringBuffer.getContextBullets(this.CARD_CONTEXT_LIMIT);

    const candidates = extractConcepts({
      chunks: recentChunks,
      glossaryEntries: runtime.glossaryCache,
      facts: runtime.factsStore.getAll(),
      contextBullets,
      existingConceptIds,
    });

    // console.log('[cards][debug] concept candidates evaluated', {
    //   eventId: runtime.eventId,
    //   recentChunkCount: recentChunks.length,
    //   candidateCount: candidates.length,
    //   candidateLabels: candidates.map((candidate) => candidate.conceptLabel),
    // });

    if (candidates.length === 0) {
      // console.log('[cards][debug] no concept candidates found', {
      //   eventId: runtime.eventId,
      //   recentChunkCount: recentChunks.length,
      // });
      return null;
    }

    const novelCandidates = candidates.filter(
      (candidate) => !runtime.cardsStore.hasRecentConcept(candidate.conceptId, this.CARD_FRESHNESS_MS)
    );

    // console.log('[cards][debug] novel concept candidates', {
    //   eventId: runtime.eventId,
    //   novelCandidateCount: novelCandidates.length,
    //   novelLabels: novelCandidates.map((candidate) => candidate.conceptLabel),
    // });

    if (novelCandidates.length === 0) {
      // console.log('[cards][debug] no novel concept candidates', {
      //   eventId: runtime.eventId,
      //   candidateCount: candidates.length,
      // });
      return null;
    }

    const conceptWindow = this.buildConceptWindowEntries(runtime, candidates, recentChunks);

    let bestCandidate: ConceptCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of novelCandidates) {
      const occurrences = this.countConceptOccurrences(recentChunks, candidate.conceptLabel);
      const { score } = computeCardSalience({
        candidate,
        runtime,
        recentChunks,
        occurrences,
        freshnessMs: this.CARD_FRESHNESS_MS,
        recentLimit: this.CARD_RECENT_LIMIT,
      });

      // console.log('[cards][debug] salience score evaluated', {
      //   eventId: runtime.eventId,
      //   conceptId: candidate.conceptId,
      //   conceptLabel: candidate.conceptLabel,
      //   occurrences,
      //   score,
      //   components,
      // });

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate || bestScore < CARD_SALIENCE_THRESHOLD) {
      // console.log('[cards][debug] no candidate exceeded salience threshold', {
      //   eventId: runtime.eventId,
      //   bestScore,
      //   threshold: CARD_SALIENCE_THRESHOLD,
      // });
      return null;
    }

    // console.log('[cards][debug] salience winner selected', {
    //   eventId: runtime.eventId,
    //   conceptId: bestCandidate.conceptId,
      // conceptLabel: bestCandidate.conceptLabel,
      // score: bestScore,
      // occurrences: bestOccurrences,
      // components: bestComponents ?? {},
    // });

    const supportingContext = await this.buildSupportingContext(
      runtime,
      bestCandidate,
      contextBullets,
      conceptWindow
    );

    return {
      conceptId: normalizeConcept(bestCandidate.conceptId),
      conceptLabel: bestCandidate.conceptLabel,
      matchSource: bestCandidate.matchSource,
      supportingContext,
    } as CardTriggerContext;
  }

  private countConceptOccurrences(chunks: TranscriptChunk[], label: string): number {
    const normalized = label.toLowerCase();
    return chunks.reduce((count, chunk) => {
      return chunk.text.toLowerCase().includes(normalized) ? count + 1 : count;
    }, 0);
  }

  private buildConceptWindowEntries(
    runtime: EventRuntime,
    candidates: ConceptCandidate[],
    recentChunks: TranscriptChunk[]
  ): CardConceptWindowEntry[] {
    if (candidates.length === 0 || recentChunks.length === 0) {
      return [];
    }

    const entries: CardConceptWindowEntry[] = [];
    const reversedChunks = [...recentChunks].reverse();
    const now = Date.now();

    for (const candidate of candidates) {
      const occurrences = this.countConceptOccurrences(recentChunks, candidate.conceptLabel);
      if (occurrences === 0) {
        continue;
      }

      const { score } = computeCardSalience({
        candidate,
        runtime,
        recentChunks,
        occurrences,
        freshnessMs: this.CARD_FRESHNESS_MS,
        recentLimit: this.CARD_RECENT_LIMIT,
      });

      const lastMentionChunk = reversedChunks.find((chunk) =>
        chunk.text.toLowerCase().includes(candidate.conceptLabel.toLowerCase())
      );

      entries.push({
        conceptId: normalizeConcept(candidate.conceptId),
        conceptLabel: candidate.conceptLabel,
        matchSource: candidate.matchSource,
        occurrences,
        score,
        lastMentionSeq: lastMentionChunk?.seq,
        lastMentionAgoMs:
          typeof lastMentionChunk?.at_ms === 'number' ? now - lastMentionChunk.at_ms : undefined,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    return entries.slice(0, this.CARD_CONCEPT_WINDOW_MAX);
  }

  private async buildSupportingContext(
    runtime: EventRuntime,
    concept: { conceptId: string; conceptLabel: string; matchSource: string },
    contextBullets: string[],
    conceptWindow: CardConceptWindowEntry[]
  ): Promise<CardTriggerContext['supportingContext']> {
    const facts = this.getRelevantFacts(runtime.factsStore.getAll(), concept);
    const recentCards = runtime.cardsStore.getRecent(this.CARD_RECENT_LIMIT);
    const glossaryEntries = this.getRelevantGlossaryEntries(runtime.glossaryCache, concept);
    const contextChunks = await this.getRelevantContextChunks(runtime, concept);
    const audienceProfile = runtime.audienceProfile;

    return {
      facts,
      recentCards,
      glossaryEntries,
      contextBullets,
      contextChunks,
      audienceProfile,
      conceptWindow,
    };
  }
  private async getRelevantContextChunks(
    runtime: EventRuntime,
    concept: { conceptId: string; conceptLabel: string }
  ): Promise<CardSupportingContextChunk[]> {
    if (!this.vectorSearch) {
      return [];
    }

    try {
      const query = concept.conceptLabel;
      const matches = await this.vectorSearch.search(
        runtime.eventId,
        query,
        this.CARD_CONTEXT_CHUNK_TOP_K
      );

      if (!matches || matches.length === 0) {
        return [];
      }

      const chunks: CardSupportingContextChunk[] = [];
      let remainingBudget = this.CARD_CONTEXT_CHUNK_TOKEN_BUDGET;

      for (const match of matches) {
        if (remainingBudget <= 0) {
          break;
        }

        const rawText = (match.chunk ?? '').trim();
        if (!rawText) {
          continue;
        }

        const perItemBudget = Math.min(this.CARD_CONTEXT_CHUNK_PER_ITEM_BUDGET, remainingBudget);
        if (perItemBudget <= 0) {
          break;
        }

        const excerpt = truncateToTokenBudget(rawText, perItemBudget);
        const tokenCount = countTokens(excerpt);

        if (tokenCount <= 0) {
          continue;
        }

        remainingBudget -= tokenCount;

        chunks.push({
          id: match.id,
          text: excerpt,
          similarity: match.similarity,
          tokenCount,
        });
      }

      return chunks;
    } catch (err: unknown) {
      console.error('[cards][warn] failed to retrieve context chunks', {
        eventId: runtime.eventId,
        conceptId: concept.conceptId,
        error: String(err),
      });
      return [];
    }
  }

  private getRelevantFacts(
    facts: Fact[],
    concept: { conceptId: string; conceptLabel: string }
  ): Array<{ key: string; value: unknown; confidence: number }> {
    const normalized = concept.conceptLabel.toLowerCase();
    const matched = facts
      .filter((fact) => {
        const keyMatch = fact.key.toLowerCase().includes(normalized);
        const valueString =
          typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value ?? '');
        const valueMatch = valueString.toLowerCase().includes(normalized);
        return keyMatch || valueMatch;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.CARD_FACT_LIMIT)
      .map((fact) => ({
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
      }));

    if (matched.length > 0) {
      return matched;
    }

    return facts
      .slice()
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.CARD_FACT_LIMIT)
      .map((fact) => ({
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
      }));
  }

  private getRelevantGlossaryEntries(
    glossaryCache: Map<string, GlossaryEntry> | undefined,
    concept: { conceptId: string; conceptLabel: string }
  ): Array<Pick<GlossaryEntry, 'term' | 'definition'>> {
    if (!glossaryCache || glossaryCache.size === 0) {
      return [];
    }

    const normalized = concept.conceptLabel.toLowerCase();
    return Array.from(glossaryCache.values())
      .filter((entry) => entry.term.toLowerCase().includes(normalized))
      .slice(0, this.CARD_FACT_LIMIT)
      .map((entry) => ({
        term: entry.term,
        definition: entry.definition,
      }));
  }

  async handleCardResponse(runtime: EventRuntime, cardInput: unknown): Promise<void> {
    try {
      if (!cardInput) {
        return;
      }

      if (!isMutableCardPayload(cardInput)) {
        console.warn(`[cards] Invalid card structure: payload is not an object`);
        return;
      }

      const card = cardInput;

      if (typeof card.title !== 'string' || card.title.length === 0) {
        console.warn(`[cards] Invalid card structure: missing title`);
        return;
      }

      const originalVisualRequest = isCardVisualRequest(card.visual_request)
        ? {
            strategy: card.visual_request.strategy,
            instructions: card.visual_request.instructions,
            source_url: card.visual_request.source_url ?? null,
          }
        : null;

      if (!originalVisualRequest && 'visual_request' in card) {
        card.visual_request = null;
      }

      let cardType: CardType = isRealtimeCardType(card.card_type)
        ? card.card_type
        : this.determineCardType(card);
      card.card_type = cardType;
      let visualRequest: CardVisualRequest | null = originalVisualRequest;

      // Override unnecessary "generate" strategy to "fetch" when appropriate
      if (visualRequest?.strategy === 'generate') {
        const shouldPreferFetch = this.shouldPreferFetchForImage(visualRequest.instructions);
        if (shouldPreferFetch) {
          visualRequest.strategy = 'fetch';
          console.log(
            `[cards] Overrode generate→fetch for card "${card.title}": ${visualRequest.instructions.substring(0, 50)}...`
          );
        }
      }

      const downgradeToText = (reason: string) => {
        if (cardType === 'text') {
          return;
        }
        console.warn(`[cards] Downgrading ${cardType} card to text: ${reason}`);
        cardType = 'text';
        card.card_type = 'text';
        card.image_url = null;
        card.visual_request = null;
        visualRequest = null;
        if (!card.body || `${card.body}`.trim().length === 0) {
          card.body = card.label ?? card.title ?? 'See transcript segment for details.';
        }
        card.label = null;
      };

      if (cardType === 'visual') {
        if (!card.label) card.label = card.title || 'Image';
        if (!card.body) card.body = null;
      } else if (cardType === 'text_visual') {
        if (!card.body) card.body = card.title || 'Definition';
      } else {
        if (!card.body) card.body = card.title || 'Definition';
        card.image_url = null;
        visualRequest = null;
        card.visual_request = null;
      }

      const cardId = randomUUID();

      if (cardType === 'visual' || cardType === 'text_visual') {
        if (!visualRequest) {
          downgradeToText('missing_visual_request');
        } else if (!this.cardImageService) {
          downgradeToText('image_service_unavailable');
        } else {
          const resolvedUrl = await this.cardImageService.handleVisualRequest(
            visualRequest,
            runtime.eventId,
            cardId
          );
          if (resolvedUrl) {
            card.image_url = resolvedUrl;
          } else {
            downgradeToText('visual_resolution_failed');
          }
        }
      } else {
        card.image_url = null;
        card.visual_request = null;
        visualRequest = null;
      }

      if ((cardType === 'visual' || cardType === 'text_visual') && !card.image_url) {
        downgradeToText('visual_unresolved');
      }

      card.visual_request = visualRequest;

      const cardSourceSeq =
        typeof card.source_seq === 'number' && Number.isFinite(card.source_seq)
          ? Math.trunc(card.source_seq)
          : undefined;
      const runtimeCardsSeq =
        typeof runtime.cardsLastSeq === 'number' && Number.isFinite(runtime.cardsLastSeq)
          ? runtime.cardsLastSeq
          : 0;
      const forSeq = cardSourceSeq ?? runtimeCardsSeq;
      const pendingConcept =
        cardSourceSeq !== undefined ? runtime.pendingCardConcepts.get(cardSourceSeq) : undefined;

      if (pendingConcept) {
        card.concept_id = pendingConcept.conceptId;
        card.concept_label = pendingConcept.conceptLabel;
      }

      const templatePlan =
        cardSourceSeq !== undefined ? runtime.pendingTemplatePlans.get(cardSourceSeq) : undefined;
      if (templatePlan) {
        card.template_id = templatePlan.templateId;
        card.template_label =
          typeof templatePlan.metadata?.label === 'string'
            ? templatePlan.metadata.label
            : templatePlan.templateId;
      }

      const templateIdValue =
        typeof card.template_id === 'string'
          ? card.template_id
          : null;
      const templateLabelValue =
        typeof card.template_label === 'string'
          ? card.template_label
          : null;

      card.image_url = card.image_url ?? null;

      // Check for duplicate card: same source_seq, template_id, and concept_id
      if (cardSourceSeq !== null && cardSourceSeq !== undefined) {
        const existingCard = await this.cardsRepository.getCardBySourceAndTemplate(
          runtime.eventId,
          cardSourceSeq,
          templateIdValue,
          card.concept_id
        );

        if (existingCard) {
          console.log(
            `[cards] Duplicate card skipped: source_seq=${cardSourceSeq}, template=${templateIdValue}, concept=${card.concept_id}, title="${card.title}"`
          );
          // Clean up pending state even though we're skipping the card
          if (cardSourceSeq !== undefined) {
            runtime.pendingCardConcepts.delete(cardSourceSeq);
            runtime.pendingTemplatePlans.delete(cardSourceSeq);
          }
          return;
        }
      }

      await this.agentOutputs.insertAgentOutput({
        id: cardId,
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        agent_type: 'cards',
        for_seq: forSeq,
        type: 'card',
        payload: card,
      });

      await this.cardsRepository.upsertCard({
        event_id: runtime.eventId,
        card_id: cardId,
        card_kind:
          typeof templateLabelValue === 'string' && templateLabelValue.length > 0
            ? templateLabelValue
            : null,
        card_type: typeof card.card_type === 'string' ? card.card_type : null,
        payload: card,
        source_seq: cardSourceSeq ?? null,
        last_seen_seq: forSeq,
        sources: Number.isFinite(forSeq) ? [Math.trunc(forSeq)] : [],
        is_active: true,
      });

      console.log(
        `[cards] Card received from Realtime API (seq: ${cardSourceSeq ?? runtimeCardsSeq}, type: ${cardType})`
      );

      if (pendingConcept && cardSourceSeq !== undefined) {
        runtime.cardsStore.add({
          conceptId: pendingConcept.conceptId,
          conceptLabel: pendingConcept.conceptLabel,
          cardType,
          sourceSeq: cardSourceSeq,
          createdAt: Date.now(),
          metadata: {
            title: card.title,
            body: card.body ?? null,
            label: card.label ?? null,
            imageUrl: card.image_url ?? null,
            templateId: templateIdValue,
            templateLabel: templateLabelValue,
            visualRequest: originalVisualRequest ?? null,
          },
        });
      }
      if (cardSourceSeq !== undefined) {
        runtime.pendingCardConcepts.delete(cardSourceSeq);
        runtime.pendingTemplatePlans.delete(cardSourceSeq);
      }
    } catch (err: unknown) {
      console.error("[event-processor] error:", String(err));
    }
  }

  async handleFactsResponse(runtime: EventRuntime, factsInput: unknown): Promise<void> {
    try {
      if (!Array.isArray(factsInput) || factsInput.length === 0) {
        return;
      }

      const facts = factsInput.filter(isRealtimeFact);
      if (facts.length === 0) {
        return;
      }

      const factsStore: FactsStore = runtime.factsStore;
      const evictedKeys: string[] = [];
      const pendingFactSources = runtime.pendingFactSources as Array<{
        seq: number;
        transcriptId: number;
      }>;
      const pendingSource =
        pendingFactSources.length > 0 ? pendingFactSources.shift() : undefined;
      const factSourceSeq =
        typeof pendingSource?.seq === 'number' ? pendingSource.seq : runtime.factsLastSeq;
      const factSourceId =
        typeof pendingSource?.transcriptId === 'number' ? pendingSource.transcriptId : undefined;

      const aliasUpdates = new Map<string, string>();
      const trackAlias = (aliasKey: string | undefined, canonicalKey: string): void => {
        if (!aliasKey) {
          return;
        }
        const normalizedAlias = aliasKey.trim().toLowerCase();
        const normalizedCanonical = canonicalKey.trim();
        if (!normalizedAlias || !normalizedCanonical) {
          return;
        }
        if (normalizedAlias === normalizedCanonical.toLowerCase()) {
          return;
        }
        aliasUpdates.set(normalizedAlias, normalizedCanonical);
      };

      const rejectedForValidation: Array<{ key: string; value: unknown; reason: string }> = [];

      for (const rawFact of facts) {
        const validated = validateRealtimeFact(rawFact);
        if (!validated) {
          continue;
        }

        if (validated.validationError) {
          rejectedForValidation.push({
            key: rawFact.key,
            value: rawFact.value,
            reason: validated.validationError,
          });
          continue;
        }

        const originalValue = validated.value;
        const finalValue = validated.rewrittenValue ?? originalValue;
        const normalizedValue = validated.rewrittenValue
          ? normalizeFactValue(finalValue)
          : validated.normalizedValue;
        const initialConfidence = validated.confidence;
        const declaredStatus = validated.declaredStatus;

        const aliasMap = runtime.factKeyAliases as FactAliasMap;
        let targetKey = resolveAliasKey(aliasMap, validated.key);
        if (targetKey !== validated.key) {
          registerAliasKey(aliasMap, validated.key, targetKey);
          trackAlias(validated.key, targetKey);
        }
        if (validated.originalKey && validated.originalKey !== targetKey) {
          registerAliasKey(aliasMap, validated.originalKey, targetKey);
          trackAlias(validated.originalKey, targetKey);
        }
        registerAliasKey(aliasMap, rawFact.key, targetKey);
        trackAlias(rawFact.key, targetKey);

        const now = Date.now();
        const candidateFact: Fact = {
          key: targetKey,
          value: finalValue,
          confidence: initialConfidence,
          lastSeenSeq: factSourceSeq,
          sources: typeof factSourceId === 'number' ? [factSourceId] : [],
          mergedFrom: [],
          mergedAt: null,
          missStreak: 0,
          createdAt: now,
          lastTouchedAt: now,
          dormantAt: null,
          prunedAt: null,
          normalizedHash: normalizedValue.hash,
          kind: validated.kind,
          originalValue,
          excludeFromPrompt: validated.excludeFromPrompt,
          fingerprintHash: normalizedValue.fingerprint,
          subject: normalizedValue.triple?.subject,
          predicate: normalizedValue.triple?.predicate,
          objects: normalizedValue.triple?.objects,
        };

        let existingFact = factsStore.get(targetKey);
        if (!existingFact && declaredStatus !== 'create') {
          // Attempt to honor declared update by searching for the closest match first.
          const similar = findBestMatchingFact(
            targetKey,
            candidateFact,
            normalizedValue,
            factsStore.getAll(true)
          );
          if (similar) {
            targetKey = similar.key;
            registerAliasKey(aliasMap, validated.key, targetKey);
            trackAlias(validated.key, targetKey);
            if (validated.originalKey && validated.originalKey !== targetKey) {
              registerAliasKey(aliasMap, validated.originalKey, targetKey);
              trackAlias(validated.originalKey, targetKey);
            }
            registerAliasKey(aliasMap, rawFact.key, targetKey);
            trackAlias(rawFact.key, targetKey);
            candidateFact.key = targetKey;
            existingFact = similar.fact;
          }
        }

        if (!existingFact) {
          const similar = findBestMatchingFact(
            targetKey,
            candidateFact,
            normalizedValue,
            factsStore.getAll(true)
          );
          if (similar) {
            targetKey = similar.key;
            registerAliasKey(aliasMap, validated.key, targetKey);
            trackAlias(validated.key, targetKey);
            if (validated.originalKey && validated.originalKey !== targetKey) {
              registerAliasKey(aliasMap, validated.originalKey, targetKey);
              trackAlias(validated.originalKey, targetKey);
            }
            registerAliasKey(aliasMap, rawFact.key, targetKey);
            trackAlias(rawFact.key, targetKey);
            candidateFact.key = targetKey;
            existingFact = similar.fact;
          }
        }

        let updatedFact: Fact | null = null;

        if (existingFact) {
          if (existingFact.normalizedHash && existingFact.normalizedHash === normalizedValue.hash) {
            const merged = factsStore.mergeFact(targetKey, {
              value: existingFact.value,
              confidence: initialConfidence,
              sourceSeq: factSourceSeq,
              sourceId: factSourceId,
              mergedKeys: rawFact.key !== targetKey ? [rawFact.key] : [],
              preferIncomingValue: false,
              normalizedHash: normalizedValue.hash,
              kind: validated.kind,
              originalValue,
              excludeFromPrompt: validated.excludeFromPrompt,
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
            continue;
          }

          const similarity = computeIngestSimilarity(existingFact, candidateFact);

          if (factsAreEquivalent(existingFact, finalValue) || shouldTreatAsDuplicate(similarity)) {
            const merged = factsStore.mergeFact(targetKey, {
              value: existingFact.value,
              confidence: initialConfidence,
              sourceSeq: factSourceSeq,
              sourceId: factSourceId,
              mergedKeys: rawFact.key !== targetKey ? [rawFact.key] : [],
              preferIncomingValue: false,
              normalizedHash: normalizedValue.hash,
              kind: validated.kind,
              originalValue,
              excludeFromPrompt: validated.excludeFromPrompt,
              fingerprintHash: normalizedValue.fingerprint,
              subject: normalizedValue.triple?.subject,
              predicate: normalizedValue.triple?.predicate,
              objects: normalizedValue.triple?.objects,
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
          } else if (shouldTreatAsMerge(similarity)) {
            const merged = factsStore.mergeFact(targetKey, {
              value: finalValue,
              confidence: initialConfidence,
              sourceSeq: factSourceSeq,
              sourceId: factSourceId,
              mergedKeys: rawFact.key !== targetKey ? [rawFact.key] : [],
              preferIncomingValue: true,
              normalizedHash: normalizedValue.hash,
              kind: validated.kind,
              originalValue,
              excludeFromPrompt: validated.excludeFromPrompt,
              fingerprintHash: normalizedValue.fingerprint,
              subject: normalizedValue.triple?.subject,
              predicate: normalizedValue.triple?.predicate,
              objects: normalizedValue.triple?.objects,
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
          } else {
            const merged = factsStore.mergeFact(targetKey, {
              value: finalValue,
              confidence: initialConfidence,
              sourceSeq: factSourceSeq,
              sourceId: factSourceId,
              mergedKeys: rawFact.key !== targetKey ? [rawFact.key] : [],
              preferIncomingValue: true,
              normalizedHash: normalizedValue.hash,
              kind: validated.kind,
              originalValue,
              excludeFromPrompt: validated.excludeFromPrompt,
              fingerprintHash: normalizedValue.fingerprint,
              subject: normalizedValue.triple?.subject,
              predicate: normalizedValue.triple?.predicate,
              objects: normalizedValue.triple?.objects,
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
          }
        } else {
          const keysEvicted = factsStore.upsert(
            targetKey,
            finalValue,
            initialConfidence,
            factSourceSeq,
            factSourceId,
            normalizedValue.hash,
            normalizedValue.fingerprint,
            validated.kind,
            originalValue,
            validated.excludeFromPrompt,
            normalizedValue.triple?.subject,
            normalizedValue.triple?.predicate,
            normalizedValue.triple?.objects
          );

          if (keysEvicted.length > 0) {
            evictedKeys.push(...keysEvicted);
          }

          updatedFact = factsStore.get(targetKey) ?? null;

          if (rawFact.key !== targetKey) {
            factsStore.recordMerge(
              targetKey,
              [rawFact.key],
              new Date().toISOString()
            );
            updatedFact = factsStore.get(targetKey) ?? null;
          }
        }

        if (!updatedFact) {
          continue;
        }

        const supabaseFact: FactRecord = {
          event_id: runtime.eventId,
          fact_key: updatedFact.key,
          fact_value: updatedFact.value,
          confidence: updatedFact.confidence,
          last_seen_seq: factSourceSeq,
          sources: updatedFact.sources,
          merge_provenance: updatedFact.mergedFrom,
          merged_at: updatedFact.mergedAt,
          dormant_at:
            typeof updatedFact.dormantAt === 'number' && Number.isFinite(updatedFact.dormantAt)
              ? new Date(updatedFact.dormantAt).toISOString()
              : null,
          pruned_at:
            typeof updatedFact.prunedAt === 'number' && Number.isFinite(updatedFact.prunedAt)
              ? new Date(updatedFact.prunedAt).toISOString()
              : null,
          is_active: !factsStore.isDormant(updatedFact.key),
        };
        if (runtime.factsNormalizedHashEnabled) {
          supabaseFact.normalized_hash = updatedFact.normalizedHash ?? normalizedValue.hash;
          supabaseFact.fact_kind = updatedFact.kind;
          supabaseFact.original_fact_value = updatedFact.originalValue ?? null;
          supabaseFact.exclude_from_prompt = updatedFact.excludeFromPrompt ?? false;
          supabaseFact.fingerprint_hash = updatedFact.fingerprintHash ?? normalizedValue.fingerprint;
          supabaseFact.fact_subject = updatedFact.subject ?? null;
          supabaseFact.fact_predicate = updatedFact.predicate ?? null;
          supabaseFact.fact_objects = Array.isArray(updatedFact.objects) ? updatedFact.objects : null;
        }

        await this.factsRepository.upsertFact(supabaseFact);

        await this.agentOutputs.insertAgentOutput({
          event_id: runtime.eventId,
          agent_id: runtime.agentId,
          agent_type: 'facts',
          for_seq: factSourceSeq,
          type: 'fact_update',
          payload: {
            ...rawFact,
            key: updatedFact.key,
            value: updatedFact.value,
            confidence: updatedFact.confidence,
            kind: updatedFact.kind,
            exclude_from_prompt: updatedFact.excludeFromPrompt ?? false,
          },
        });
      }

      if (evictedKeys.length > 0) {
        await this.factsRepository.updateFactActiveStatus(runtime.eventId, evictedKeys, false);
        console.log(
          `[event-processor] Marked ${evictedKeys.length} evicted facts as inactive for event ${runtime.eventId}`
        );
      }

      if (rejectedForValidation.length > 0) {
        console.log('[facts][validation] rejected facts', {
          eventId: runtime.eventId,
          rejections: rejectedForValidation.map((entry) => ({
            key: entry.key,
            reason: entry.reason,
          })),
        });
      }

      if (aliasUpdates.size > 0) {
        await this.factsRepository.upsertFactAliases(
          runtime.eventId,
          Array.from(aliasUpdates.entries()).map(([aliasKey, canonicalKey]) => ({
            aliasKey,
            canonicalKey,
          }))
        );
      }

      console.log(`[facts] ${facts.length} facts updated from Realtime API`);
    } catch (err: unknown) {
      console.error("[event-processor] error:", String(err));
    }
  }

  /**
   * Determine if an image request should prefer "fetch" over "generate" strategy.
   * This helps reduce costs by preferring image retrieval over generation when appropriate.
   */
  private shouldPreferFetchForImage(instructions: string): boolean {
    if (!instructions || typeof instructions !== 'string') {
      return false;
    }

    const lower = instructions.toLowerCase();

    // Keywords that strongly suggest fetch is appropriate (real-world, photographic content)
    const fetchKeywords = [
      'photo',
      'photograph',
      'picture',
      'image',
      'portrait',
      'building',
      'place',
      'location',
      'person',
      'people',
      'object',
      'real',
      'actual',
      'historical',
      'event',
      'landmark',
      'skyline',
      'trading',
      'office',
      'headquarters',
      'bank',
      'vault',
      'floor',
      'headquarters',
      'screenshot',
      'device',
      'equipment',
    ];

    // Keywords that strongly suggest generate is needed (abstract, conceptual)
    const generateKeywords = ['flowchart', 'diagram', 'schematic', 'abstract', 'conceptual', 'architecture diagram', 'process flow'];

    const hasFetchKeywords = fetchKeywords.some((kw) => lower.includes(kw));
    const hasGenerateKeywords = generateKeywords.some((kw) => lower.includes(kw));

    // Prefer fetch if it contains fetch keywords OR doesn't explicitly need generation
    // Default to preferring fetch (more cost-effective)
    return hasFetchKeywords || !hasGenerateKeywords;
  }
}

