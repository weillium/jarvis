import type {
  EventRuntime,
  RealtimeCardDTO,
  RealtimeFactDTO,
  TranscriptChunk,
} from '../types';
import type { CardsProcessor } from '../processing/cards-processor';
import type { FactsProcessor } from '../processing/facts-processor';
import type { TranscriptProcessor } from '../processing/transcript-processor';
import type { AgentOutputsRepository } from '../services/supabase/agent-outputs-repository';
import type { FactsRepository } from '../services/supabase/facts-repository';

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
  private readonly FACTS_DEBOUNCE_MS = 25000;

  constructor(
    private readonly cardsProcessor: CardsProcessor,
    private readonly factsProcessor: FactsProcessor,
    private readonly transcriptProcessor: TranscriptProcessor,
    private readonly agentOutputs: AgentOutputsRepository,
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
    // Transcript agent handlers can be added here if needed
    // For now, transcript agent may not emit events that need handling
    
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
    if (runtime.factsUpdateTimer) {
      clearTimeout(runtime.factsUpdateTimer);
      runtime.factsUpdateTimer = undefined;
    }
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
      await this.cardsProcessor.process(runtime, chunk, runtime.cardsSession, runtime.cardsSessionId);
    }

    if (runtime.enabledAgents.facts) {
      this.scheduleFactsUpdate(runtime);
    }
  }

  private scheduleFactsUpdate(runtime: EventRuntime): void {
    if (!runtime.enabledAgents.facts) {
      return;
    }

    if (runtime.factsUpdateTimer) {
      clearTimeout(runtime.factsUpdateTimer);
    }

    runtime.factsUpdateTimer = setTimeout(() => {
      runtime.factsUpdateTimer = undefined;
      void this.factsProcessor.process(runtime, runtime.factsSession, runtime.factsSessionId);
    }, this.FACTS_DEBOUNCE_MS);
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

      await this.agentOutputs.insertAgentOutput({
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        agent_type: 'cards',
        for_seq: card.source_seq || runtime.cardsLastSeq,
        type: 'card',
        payload: card,
      });

      // Cards are now inserted via insertAgentOutput only (no need for separate insertCard)

      console.log(
        `[cards] Card received from Realtime API (seq: ${card.source_seq || runtime.cardsLastSeq}, type: ${cardType})`
      );
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

      const evictedKeys: string[] = [];
      
      for (const fact of facts) {
        if (!fact.key || fact.value === undefined) continue;

        const initialConfidence =
          (typeof fact.confidence === 'number' ? fact.confidence : undefined) || 0.7;
        const keysEvicted = runtime.factsStore.upsert(fact.key, fact.value, initialConfidence, runtime.factsLastSeq, undefined);
        
        // Accumulate evicted keys to mark as inactive later
        if (keysEvicted.length > 0) {
          evictedKeys.push(...keysEvicted);
        }

        // Get the computed confidence from FactsStore (may have been adjusted)
        const storedFact = runtime.factsStore.get(fact.key);
        const computedConfidence = storedFact?.confidence ?? initialConfidence;

        await this.factsRepository.upsertFact({
          event_id: runtime.eventId,
          fact_key: fact.key,
          fact_value: fact.value,
          confidence: computedConfidence,
          last_seen_seq: runtime.factsLastSeq,
          sources: storedFact?.sources || [],
        });

        await this.agentOutputs.insertAgentOutput({
          event_id: runtime.eventId,
          agent_id: runtime.agentId,
          agent_type: 'facts',
          for_seq: runtime.factsLastSeq,
          type: 'fact_update',
          payload: fact,
        });
      }

      // Mark evicted facts as inactive in database
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
