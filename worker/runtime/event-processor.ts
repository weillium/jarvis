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
import type { CardsProcessor, CardTriggerContext } from '../processing/cards-processor';
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
import {
  CARD_SALIENCE_THRESHOLD,
  computeCardSalience,
  type CardSalienceComponents,
} from './cards/salience';
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
  source_seq?: number;
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

type DetermineCardTypeFn = (
  card: DetermineCardPayload,
  transcriptText: string
) => CardType;

export class EventProcessor {
  private readonly CARD_WINDOW_CHUNKS = Number(process.env.CARDS_CONCEPT_WINDOW ?? 3);
  private readonly CARD_MIN_CHUNKS = Number(process.env.CARDS_CONCEPT_MIN_CHUNKS ?? 2);
  private readonly CARD_FRESHNESS_MS =
    Number(process.env.CARDS_CONCEPT_FRESHNESS_MS ?? 5 * 60 * 1000);
  private readonly CARD_FACT_LIMIT = Number(process.env.CARDS_SUPPORTING_FACTS_LIMIT ?? 5);
  private readonly CARD_CONTEXT_LIMIT = Number(process.env.CARDS_SUPPORTING_CONTEXT_LIMIT ?? 5);
  private readonly CARD_RECENT_LIMIT = Number(process.env.CARDS_SUPPORTING_RECENT_LIMIT ?? 5);

  constructor(
    private readonly cardsProcessor: CardsProcessor,
    private readonly factsProcessor: FactsProcessor,
    private readonly transcriptProcessor: TranscriptProcessor,
    private readonly agentOutputs: AgentOutputsRepository,
    private readonly cardsRepository: CardsRepository,
    private readonly factsRepository: FactsRepository,
    private readonly determineCardType: DetermineCardTypeFn
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
        console.log('[cards][debug] rate limit prevented card trigger', {
          eventId: runtime.eventId,
          reason: rateLimitCheck.reason,
        });
        return;
      }

      console.log('[cards][debug] evaluating card trigger', {
        eventId: runtime.eventId,
        lastSeq: chunk.seq,
      });
      const triggerContext = this.evaluateCardTrigger(runtime);
      if (triggerContext) {
        console.log('[cards][debug] card trigger selected', {
          eventId: runtime.eventId,
          conceptId: triggerContext.conceptId,
          conceptLabel: triggerContext.conceptLabel,
        });
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
      console.log('[cards][debug] cards agent disabled for runtime', {
        eventId: runtime.eventId,
      });
    } else if (!runtime.cardsSession) {
      console.log('[cards][debug] cards session missing; skipping trigger evaluation', {
        eventId: runtime.eventId,
      });
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

    void this.factsProcessor.process(runtime, runtime.factsSession, runtime.factsSessionId);
  }

  private evaluateCardTrigger(runtime: EventRuntime): CardTriggerContext | null {
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

    console.log('[cards][debug] concept candidates evaluated', {
      eventId: runtime.eventId,
      recentChunkCount: recentChunks.length,
      candidateCount: candidates.length,
      candidateLabels: candidates.map((candidate) => candidate.conceptLabel),
    });

    if (candidates.length === 0) {
      console.log('[cards][debug] no concept candidates found', {
        eventId: runtime.eventId,
        recentChunkCount: recentChunks.length,
      });
      return null;
    }

    const novelCandidates = candidates.filter(
      (candidate) => !runtime.cardsStore.hasRecentConcept(candidate.conceptId, this.CARD_FRESHNESS_MS)
    );

    console.log('[cards][debug] novel concept candidates', {
      eventId: runtime.eventId,
      novelCandidateCount: novelCandidates.length,
      novelLabels: novelCandidates.map((candidate) => candidate.conceptLabel),
    });

    if (novelCandidates.length === 0) {
      console.log('[cards][debug] no novel concept candidates', {
        eventId: runtime.eventId,
        candidateCount: candidates.length,
      });
      return null;
    }

    let bestCandidate: ConceptCandidate | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestComponents: CardSalienceComponents | null = null;
    let bestOccurrences = 0;

    for (const candidate of novelCandidates) {
      const occurrences = this.countConceptOccurrences(recentChunks, candidate.conceptLabel);
      const { score, components } = computeCardSalience({
        candidate,
        runtime,
        recentChunks,
        occurrences,
        freshnessMs: this.CARD_FRESHNESS_MS,
        recentLimit: this.CARD_RECENT_LIMIT,
      });

      console.log('[cards][debug] salience score evaluated', {
        eventId: runtime.eventId,
        conceptId: candidate.conceptId,
        conceptLabel: candidate.conceptLabel,
        occurrences,
        score,
        components,
      });

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
        bestComponents = components;
        bestOccurrences = occurrences;
      }
    }

    if (!bestCandidate || bestScore < CARD_SALIENCE_THRESHOLD) {
      console.log('[cards][debug] no candidate exceeded salience threshold', {
        eventId: runtime.eventId,
        bestScore,
        threshold: CARD_SALIENCE_THRESHOLD,
      });
      return null;
    }

    console.log('[cards][debug] salience winner selected', {
      eventId: runtime.eventId,
      conceptId: bestCandidate.conceptId,
      conceptLabel: bestCandidate.conceptLabel,
      score: bestScore,
      occurrences: bestOccurrences,
      components: bestComponents ?? {},
    });

    const supportingContext = this.buildSupportingContext(runtime, bestCandidate, contextBullets);

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

  private buildSupportingContext(
    runtime: EventRuntime,
    concept: { conceptId: string; conceptLabel: string; matchSource: string },
    contextBullets: string[]
  ): CardTriggerContext['supportingContext'] {
    const facts = this.getRelevantFacts(runtime.factsStore.getAll(), concept);
    const recentCards = runtime.cardsStore.getRecent(this.CARD_RECENT_LIMIT);
    const glossaryEntries = this.getRelevantGlossaryEntries(runtime.glossaryCache, concept);

    return {
      facts,
      recentCards,
      glossaryEntries,
      contextBullets,
    };
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

      if (typeof card.kind !== 'string' || typeof card.title !== 'string' || card.kind.length === 0 || card.title.length === 0) {
        console.warn(`[cards] Invalid card structure: missing kind or title`);
        return;
      }

      const cardType: CardType = isRealtimeCardType(card.card_type)
        ? card.card_type
        : this.determineCardType(card, '');
      card.card_type = cardType;

      if (cardType === 'visual') {
        if (!card.label) card.label = card.title || 'Image';
        if (!card.body) card.body = null;
      } else if (cardType === 'text_visual') {
        if (!card.body) card.body = card.title || 'Definition';
      } else {
        if (!card.body) card.body = card.title || 'Definition';
        card.image_url = null;
      }

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
        (card as MutableCardPayload & { concept_id?: string; concept_label?: string }).concept_id =
          pendingConcept.conceptId;
        (card as MutableCardPayload & { concept_id?: string; concept_label?: string }).concept_label =
          pendingConcept.conceptLabel;
      }

      const cardId = randomUUID();

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
        card_kind: typeof card.kind === 'string' ? card.kind : null,
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
          },
        });
      }
      if (cardSourceSeq !== undefined) {
        runtime.pendingCardConcepts.delete(cardSourceSeq);
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

      for (const rawFact of facts) {
        const validated = validateRealtimeFact(rawFact);
        if (!validated) {
          continue;
        }

        const normalizedValue = validated.normalizedValue;
        const sanitizedValue = normalizedValue.raw;
        const initialConfidence = validated.confidence;

        const aliasMap = runtime.factKeyAliases as FactAliasMap;
        let targetKey = resolveAliasKey(aliasMap, validated.key);
        if (targetKey !== validated.key) {
          registerAliasKey(aliasMap, validated.key, targetKey);
        }
        if (validated.originalKey && validated.originalKey !== targetKey) {
          registerAliasKey(aliasMap, validated.originalKey, targetKey);
        }
        registerAliasKey(aliasMap, rawFact.key, targetKey);

        const now = Date.now();
        const candidateFact: Fact = {
          key: targetKey,
          value: sanitizedValue,
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
        };

        let existingFact = factsStore.get(targetKey);
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
            if (validated.originalKey && validated.originalKey !== targetKey) {
              registerAliasKey(aliasMap, validated.originalKey, targetKey);
            }
            registerAliasKey(aliasMap, rawFact.key, targetKey);
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
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
            continue;
          }

          const similarity = computeIngestSimilarity(existingFact, candidateFact);

          if (factsAreEquivalent(existingFact, sanitizedValue) || shouldTreatAsDuplicate(similarity)) {
            const merged = factsStore.mergeFact(targetKey, {
              value: existingFact.value,
              confidence: initialConfidence,
              sourceSeq: factSourceSeq,
              sourceId: factSourceId,
              mergedKeys: rawFact.key !== targetKey ? [rawFact.key] : [],
              preferIncomingValue: false,
              normalizedHash: normalizedValue.hash,
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
          } else if (shouldTreatAsMerge(similarity)) {
            const merged = factsStore.mergeFact(targetKey, {
              value: sanitizedValue,
              confidence: initialConfidence,
              sourceSeq: factSourceSeq,
              sourceId: factSourceId,
              mergedKeys: rawFact.key !== targetKey ? [rawFact.key] : [],
              preferIncomingValue: true,
              normalizedHash: normalizedValue.hash,
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
          } else {
            const merged = factsStore.mergeFact(targetKey, {
              value: sanitizedValue,
              confidence: initialConfidence,
              sourceSeq: factSourceSeq,
              sourceId: factSourceId,
              mergedKeys: rawFact.key !== targetKey ? [rawFact.key] : [],
              preferIncomingValue: true,
              normalizedHash: normalizedValue.hash,
            });
            updatedFact = merged ?? factsStore.get(targetKey) ?? null;
          }
        } else {
          const keysEvicted = factsStore.upsert(
            targetKey,
            sanitizedValue,
            initialConfidence,
            factSourceSeq,
            factSourceId,
            normalizedValue.hash
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
          normalized_hash: updatedFact.normalizedHash ?? normalizedValue.hash,
        };

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
          },
        });
      }

      if (evictedKeys.length > 0) {
        await this.factsRepository.updateFactActiveStatus(runtime.eventId, evictedKeys, false);
        console.log(
          `[event-processor] Marked ${evictedKeys.length} evicted facts as inactive for event ${runtime.eventId}`
        );
      }

      console.log(`[facts] ${facts.length} facts updated from Realtime API`);
    } catch (err: unknown) {
      console.error("[event-processor] error:", String(err));
    }
  }
}

