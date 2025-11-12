import type { EventRuntime, TranscriptChunk } from '../types';
import { RingBuffer } from '../state/ring-buffer';
import { FactsStore } from '../state/facts-store';
import { CardsStore, type CardRecord } from '../state/cards-store';
import type { GlossaryManager } from '../context/glossary-manager';
import type { CheckpointManager } from '../services/observability/checkpoint-manager';
import type { MetricsCollector } from '../services/observability/metrics-collector';
import type { Logger } from '../services/observability/logger';
import type { FactsRepository } from '../services/supabase/facts-repository';
import type { TranscriptsRepository } from '../services/supabase/transcripts-repository';
import type { AgentsRepository } from '../services/supabase/agents-repository';
import type { CardsRepository } from '../services/supabase/cards-repository';
import { normalizeCardStateRecord } from '../lib/cards/payload-normalizer';
import type { FactKind } from './facts/fact-types';

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
    let normalizedHashSupported = false;
    try {
      normalizedHashSupported = await this.factsRepository.supportsNormalizedHashColumn();
    } catch {
      normalizedHashSupported = false;
    }

    this.metrics.clear(eventId);
    this.logger.clearLogs(eventId, 'transcript');
    this.logger.clearLogs(eventId, 'cards');
    this.logger.clearLogs(eventId, 'facts');

    const factsStore = new FactsStore(50);
    const activeFacts = await this.factsRepository.getFacts(eventId, true);
    if (activeFacts.length > 0) {
      type LoadableFact = Parameters<FactsStore['loadFacts']>[0][number];
      const formattedFacts: LoadableFact[] = activeFacts.map((f) => {
        const value: unknown = f.fact_value;
        const rawSources: unknown = f.sources;
        const sources: number[] = Array.isArray(rawSources)
          ? rawSources.filter((entry): entry is number => typeof entry === 'number')
          : [];
        const rawMergeProvenance: unknown = f.merge_provenance;
        const mergeProvenance: string[] = Array.isArray(rawMergeProvenance)
          ? rawMergeProvenance.filter((entry): entry is string => typeof entry === 'string')
          : [];
        const rawMergedAt: unknown = f.merged_at;
        const mergedAt: string | null = typeof rawMergedAt === 'string' ? rawMergedAt : null;
        let createdAtMs = Date.now();
        if (typeof f.created_at === 'string') {
          const parsedTime = new Date(f.created_at).getTime();
          if (!Number.isNaN(parsedTime)) {
            createdAtMs = parsedTime;
          }
        }

        let updatedAtMs = createdAtMs;
        if (typeof f.updated_at === 'string') {
          const parsedTime = new Date(f.updated_at).getTime();
          if (!Number.isNaN(parsedTime)) {
            updatedAtMs = parsedTime;
          }
        }

        const kind: FactKind =
          typeof f.fact_kind === 'string' && (['claim', 'question', 'meta'] as FactKind[]).includes(
            f.fact_kind as FactKind
          )
            ? (f.fact_kind as FactKind)
            : 'claim';

        return {
          key: f.fact_key,
          value,
          confidence: f.confidence,
          lastSeenSeq: f.last_seen_seq,
          sources,
          mergedFrom: mergeProvenance,
          mergedAt,
          missStreak: 0,
          createdAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
          lastTouchedAt: Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now(),
          dormantAt: null,
          prunedAt: null,
          normalizedHash: typeof f.normalized_hash === 'string' ? f.normalized_hash : undefined,
          fingerprintHash: typeof f.fingerprint_hash === 'string' ? f.fingerprint_hash : undefined,
          kind,
          originalValue: f.original_fact_value,
          excludeFromPrompt: typeof f.exclude_from_prompt === 'boolean' ? f.exclude_from_prompt : false,
          subject: typeof f.fact_subject === 'string' ? f.fact_subject : undefined,
          predicate: typeof f.fact_predicate === 'string' ? f.fact_predicate : undefined,
          objects: Array.isArray(f.fact_objects)
            ? f.fact_objects.filter((entry): entry is string => typeof entry === 'string')
            : undefined,
        };
      });
      if (
        !normalizedHashSupported &&
        formattedFacts.some(
          (fact) =>
            typeof fact.normalizedHash === 'string' ||
            typeof fact.fingerprintHash === 'string'
        )
      ) {
        normalizedHashSupported = true;
      }
      const evictedKeys = factsStore.loadFacts(formattedFacts);

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
        const record = normalizeCardStateRecord(card);
        if (record) {
          cardsLastSeq = Math.max(cardsLastSeq, record.sourceSeq);
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
      factKeyAliases: new Map(),
      factsNormalizedHashEnabled: normalizedHashSupported,
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
}

