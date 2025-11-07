import type { EventRuntime } from '../types';
import type { CardsProcessor } from '../processing/cards-processor';
import type { FactsProcessor } from '../processing/facts-processor';
import type { TranscriptProcessor } from '../processing/transcript-processor';
import type { TranscriptChunk } from '../types';
import type { AgentOutputsRepository } from '../services/supabase/agent-outputs-repository';
import type { FactsRepository } from '../services/supabase/facts-repository';

type DetermineCardTypeFn = (card: any, transcriptText: string) => 'text' | 'text_visual' | 'visual';

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

  async handleTranscript(runtime: EventRuntime, transcript: any): Promise<void> {
    const chunk = this.transcriptProcessor.convertToChunk(transcript);
    await this.processTranscriptChunk(runtime, chunk);
  }

  attachSessionHandlers(runtime: EventRuntime): void {
    // Transcript agent handlers can be added here if needed
    // For now, transcript agent may not emit events that need handling
    
    if (runtime.cardsSession && runtime.cardsSession !== runtime.cardsHandlerSession) {
      runtime.cardsSession.on('card', async (card: any) => {
        await this.handleCardResponse(runtime, card);
      });
      runtime.cardsHandlerSession = runtime.cardsSession;
    }

    if (runtime.factsSession && runtime.factsSession !== runtime.factsHandlerSession) {
      runtime.factsSession.on('facts', async (facts: any[]) => {
        await this.handleFactsResponse(runtime, facts);
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

    await this.cardsProcessor.process(runtime, chunk, runtime.cardsSession, runtime.cardsSessionId);

    this.scheduleFactsUpdate(runtime);
  }

  private scheduleFactsUpdate(runtime: EventRuntime): void {
    if (runtime.factsUpdateTimer) {
      clearTimeout(runtime.factsUpdateTimer);
    }

    runtime.factsUpdateTimer = setTimeout(() => {
      runtime.factsUpdateTimer = undefined;
      void this.factsProcessor.process(runtime, runtime.factsSession, runtime.factsSessionId);
    }, this.FACTS_DEBOUNCE_MS);
  }

  async handleCardResponse(runtime: EventRuntime, card: any): Promise<void> {
    try {
      if (!card) {
        return;
      }

      if (!card.kind || !card.title) {
        console.warn(`[cards] Invalid card structure: missing kind or title`);
        return;
      }

      if (!card.card_type || !['text', 'text_visual', 'visual'].includes(card.card_type)) {
        card.card_type = this.determineCardType(card, '');
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
        for_seq: card.source_seq || runtime.cardsLastSeq,
        type: 'card',
        payload: card,
      });

      // Cards are now inserted via insertAgentOutput only (no need for separate insertCard)

      console.log(
        `[cards] Card received from Realtime API (seq: ${card.source_seq || runtime.cardsLastSeq}, type: ${card.card_type})`
      );
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

  async handleFactsResponse(runtime: EventRuntime, facts: any[]): Promise<void> {
    try {
      if (!facts || facts.length === 0) {
        return;
      }

      const evictedKeys: string[] = [];
      
      for (const fact of facts) {
        if (!fact.key || fact.value === undefined) continue;

        const initialConfidence = fact.confidence || 0.7;
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
      console.error("[worker] error:", String(err));
    }
  }
}
