import type { EventRuntime, TranscriptChunk, CardStateRecord } from '../types';
import { RingBuffer } from '../state/ring-buffer';
import { FactsStore } from '../state/facts-store';
import { CardsStore, type CardRecord } from '../state/cards-store';
import type { GlossaryManager } from '../context/glossary-manager';
import type { CheckpointManager } from '../monitoring/checkpoint-manager';
import type { MetricsCollector } from '../monitoring/metrics-collector';
import type { Logger } from '../monitoring/logger';
import type { FactsRepository } from '../services/supabase/facts-repository';
import type { TranscriptsRepository } from '../services/supabase/transcripts-repository';
import type { AgentsRepository } from '../services/supabase/agents-repository';
import type { CardsRepository } from '../services/supabase/cards-repository';

const CARD_TYPES = new Set(['text', 'text_visual', 'visual']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toFiniteInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
};

export class RuntimeManager {
  private readonly runtimes: Map<string, EventRuntime> = new Map();

  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly cardsRepository: CardsRepository,
    private readonly factsRepository: FactsRepository,
    private readonly transcriptsRepository: TranscriptsRepository,
    private readonly glossaryManager: GlossaryManager,
    private readonly checkpointManager: CheckpointManager,
    private readonly metrics: MetricsCollector,
    private readonly logger: Logger
  ) {}

  getRuntime(eventId: string): EventRuntime | undefined {
    return this.runtimes.get(eventId);
  }

  getAllRuntimes(): EventRuntime[] {
    return Array.from(this.runtimes.values());
  }

  removeRuntime(eventId: string): void {
    this.runtimes.delete(eventId);
  }

  async createRuntime(eventId: string, agentId: string): Promise<EventRuntime> {
    const checkpoints = await this.checkpointManager.loadCheckpoints(eventId);
    const glossaryCache = await this.glossaryManager.loadGlossary(eventId);

    this.metrics.clear(eventId);
    this.logger.clearLogs(eventId, 'transcript');
    this.logger.clearLogs(eventId, 'cards');
    this.logger.clearLogs(eventId, 'facts');

    const factsStore = new FactsStore(50);
    const activeFacts = await this.factsRepository.getFacts(eventId, true);
    if (activeFacts.length > 0) {
      const evictedKeys = factsStore.loadFacts(
        activeFacts.map((f) => ({
          key: f.fact_key,
          value: f.fact_value,
          confidence: f.confidence,
          lastSeenSeq: f.last_seen_seq,
          sources: f.sources || [],
        }))
      );

      if (evictedKeys.length > 0) {
        await this.factsRepository.updateFactActiveStatus(eventId, evictedKeys, false);
        console.log(
          `[runtime-manager] Loaded ${activeFacts.length} active facts, evicted ${evictedKeys.length} facts (capacity limit)`
        );
      } else {
        console.log(
          `[runtime-manager] Loaded ${activeFacts.length} active facts into FactsStore for event ${eventId}`
        );
      }
    }

    const cardsStore = new CardsStore(100);
    let cardsLastSeq = checkpoints.cards || 0;
    const activeCards = await this.cardsRepository.getCards(eventId, true);

    if (activeCards.length > 0) {
      const loadedCards: CardRecord[] = [];

      for (const card of activeCards) {
        const seqCandidate = toFiniteInteger(card.last_seen_seq);
        if (seqCandidate !== null) {
          cardsLastSeq = Math.max(cardsLastSeq, seqCandidate);
        }

        const record = this.mapCardStateToRecord(card);
        if (record) {
          loadedCards.push(record);
        }
      }

      loadedCards.forEach((cardRecord) => cardsStore.add(cardRecord));

      console.log(
        `[runtime-manager] Loaded ${loadedCards.length} active cards into CardsStore for event ${eventId}`
      );
    }

    const runtime: EventRuntime = {
      eventId,
      agentId,
      status: 'context_complete',
      enabledAgents: {
        transcript: false,
        cards: false,
        facts: false,
      },
      logCounters: {},
      ringBuffer: new RingBuffer(1000, 5 * 60 * 1000),
      factsStore,
      cardsStore,
      glossaryCache,
      pendingCardConcepts: new Map(),
      pendingFactSources: [],
      transcriptLastSeq: checkpoints.transcript || 0,
      cardsLastSeq,
      factsLastSeq: checkpoints.facts,
      factsLastUpdate: Date.now(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.runtimes.set(eventId, runtime);
    return runtime;
  }

  async replayTranscripts(runtime: EventRuntime): Promise<void> {
    const transcripts = await this.transcriptsRepository.getTranscriptsForReplay(
      runtime.eventId,
      Math.max(runtime.transcriptLastSeq, runtime.cardsLastSeq, runtime.factsLastSeq),
      1000
    );

    if (!transcripts.length) {
      return;
    }

    console.log(
      `[runtime-manager] Replaying ${transcripts.length} transcripts for event ${runtime.eventId}`
    );

    for (const t of transcripts) {
      const chunk: TranscriptChunk = {
        seq: t.seq || 0,
        at_ms: t.at_ms || Date.now(),
        speaker: t.speaker || undefined,
        text: t.text,
        final: t.final !== false,
        transcript_id: t.id,
      };

      runtime.ringBuffer.add(chunk);
    }

    const lastSeq = Math.max(...transcripts.map((t) => t.seq || 0));
    runtime.transcriptLastSeq = Math.max(runtime.transcriptLastSeq, lastSeq);
    runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, lastSeq);
    runtime.factsLastSeq = Math.max(runtime.factsLastSeq, lastSeq);
  }

  async resumeExistingEvents(limit: number = 50): Promise<EventRuntime[]> {
    const agents = await this.agentsRepository.getAgentsByStatus('running', limit);
    if (!agents.length) {
      return [];
    }

    const runtimes: EventRuntime[] = [];
    for (const agent of agents) {
      try {
        const runtime = await this.createRuntime(agent.event_id, agent.id);
        await this.replayTranscripts(runtime);
        runtimes.push(runtime);
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      }
    }

    return runtimes;
  }

  private mapCardStateToRecord(card: CardStateRecord): CardRecord | null {
    if (!isRecord(card.payload)) {
      return null;
    }

    const payload = card.payload;
    const conceptId =
      typeof payload.concept_id === 'string' && payload.concept_id.trim().length > 0
        ? payload.concept_id
        : card.card_id;
    const conceptLabel =
      typeof payload.concept_label === 'string' && payload.concept_label.trim().length > 0
        ? payload.concept_label
        : typeof payload.title === 'string' && payload.title.trim().length > 0
        ? payload.title
        : 'Card';

    const cardTypeRaw = payload.card_type;
    const cardType =
      typeof cardTypeRaw === 'string' && CARD_TYPES.has(cardTypeRaw) ? cardTypeRaw : 'text';

    const sourceSeq =
      toFiniteInteger(card.source_seq) ??
      toFiniteInteger(card.last_seen_seq) ??
      0;

    const createdAtIso = typeof card.updated_at === 'string' ? card.updated_at : card.created_at;
    const createdAtParsed = createdAtIso ? Date.parse(createdAtIso) : Number.NaN;
    const createdAt = Number.isFinite(createdAtParsed) ? createdAtParsed : Date.now();

    const title = typeof payload.title === 'string' ? payload.title : undefined;
    const body =
      typeof payload.body === 'string' ? payload.body : payload.body === null ? null : null;
    const label =
      typeof payload.label === 'string' ? payload.label : payload.label === null ? null : null;
    const imageUrl =
      typeof payload.image_url === 'string'
        ? payload.image_url
        : payload.image_url === null
        ? null
        : null;

    return {
      conceptId,
      conceptLabel,
      cardType,
      sourceSeq,
      createdAt,
      metadata: {
        title,
        body,
        label,
        imageUrl,
        agentOutputId: card.card_id,
      },
    };
  }
}

