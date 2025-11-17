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
import type { ContextBlueprintRepository } from '../services/supabase/context-blueprint-repository';
import { normalizeCardStateRecord } from '../lib/cards/payload-normalizer';
import type { FactKind } from './facts/fact-types';
import { registerAliasKey } from './facts/alias-map';
import type { Blueprint } from '../context/pipeline/blueprint/types';

const normalizeTemplateList = (raw: unknown): string[] | null => {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (Array.isArray(raw)) {
    const normalized = raw
      .map((value) => (typeof value === 'string' ? value.trim() : String(value).trim()))
      .filter((value) => value.length > 0);
    return normalized.length > 0 ? normalized : [];
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const normalized = trimmed
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return normalized.length > 0 ? normalized : [];
  }

  return null;
};

const cardTemplateAllowlistByEvent: Map<string, string[]> = new Map();
let cardTemplateAllowlistDefault: string[] | null = normalizeTemplateList(
  process.env.CARDS_TEMPLATE_ALLOWLIST_DEFAULT
);

const cardTemplateAllowlistJson = process.env.CARDS_TEMPLATE_ALLOWLIST_JSON;
if (cardTemplateAllowlistJson) {
  try {
    const parsed = JSON.parse(cardTemplateAllowlistJson) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) {
        const normalized = normalizeTemplateList(value);
        if (normalized === null) {
          continue;
        }
        if (key === 'default') {
          cardTemplateAllowlistDefault = normalized;
        } else {
          cardTemplateAllowlistByEvent.set(key, normalized);
        }
      }
    }
  } catch (error) {
    console.error('[runtime-manager] Failed to parse CARDS_TEMPLATE_ALLOWLIST_JSON', {
      error: String(error),
    });
  }
}

const getCardTemplateAllowlistForEvent = (eventId: string): string[] | null => {
  return cardTemplateAllowlistByEvent.get(eventId) ?? cardTemplateAllowlistDefault;
};

export class RuntimeManager {
  private readonly runtimes: Map<string, EventRuntime> = new Map();

  constructor(
    private readonly agentsRepository: AgentsRepository,
    private readonly cardsRepository: CardsRepository,
    private readonly factsRepository: FactsRepository,
    private readonly transcriptsRepository: TranscriptsRepository,
    private readonly contextBlueprintRepository: ContextBlueprintRepository,
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

    let audienceProfile: string | undefined;
    try {
      const profile = await this.contextBlueprintRepository.getAudienceProfile(eventId);
      if (profile) {
        audienceProfile = this.formatAudienceProfile(profile);
      }
    } catch (err) {
      console.error('[runtime-manager] Failed to load audience profile', {
        eventId,
        error: String(err),
      });
    }

    this.metrics.clear(eventId);
    this.logger.clearLogs(eventId, 'transcript');
    this.logger.clearLogs(eventId, 'cards');
    this.logger.clearLogs(eventId, 'facts');

    const factsStore = new FactsStore(50);
    const factKeyAliases = new Map<string, string>();
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

        let dormantAtMs: number | null = null;
        if (typeof f.dormant_at === 'string') {
          const parsedDormant = new Date(f.dormant_at).getTime();
          if (!Number.isNaN(parsedDormant)) {
            dormantAtMs = parsedDormant;
          }
        }

        let prunedAtMs: number | null = null;
        if (typeof f.pruned_at === 'string') {
          const parsedPruned = new Date(f.pruned_at).getTime();
          if (!Number.isNaN(parsedPruned)) {
            prunedAtMs = parsedPruned;
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
          dormantAt: dormantAtMs,
          prunedAt: prunedAtMs,
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

    const aliasRecords = await this.factsRepository.getFactAliases(eventId);
    for (const alias of aliasRecords) {
      registerAliasKey(factKeyAliases, alias.alias_key, alias.canonical_key);
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
      pendingTemplatePlans: new Map(),
      pendingFactSources: [],
      factKeyAliases,
      factsNormalizedHashEnabled: normalizedHashSupported,
      audienceProfile,
      cardsTemplateAllowlist: getCardTemplateAllowlistForEvent(eventId),
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

  private formatAudienceProfile(profile: Blueprint['audience_profile']): string {
    const sections: string[] = [];

    const summary = profile.audience_summary.trim();
    if (summary.length > 0) {
      sections.push(summary);
    }

    const formatList = (label: string, values: string[]) => {
      if (!values || values.length === 0) {
        return;
      }
      const normalized = values
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (normalized.length === 0) {
        return;
      }
      sections.push(`${label}:\n${normalized.map((value) => `- ${value}`).join('\n')}`);
    };

    formatList('Primary Roles', profile.primary_roles);
    formatList('Core Needs', profile.core_needs);
    formatList('Desired Outcomes', profile.desired_outcomes);

    const tone = profile.tone_and_voice.trim();
    if (tone.length > 0) {
      sections.push(`Tone & Voice: ${tone}`);
    }

    formatList('Cautionary Notes', profile.cautionary_notes);

    return sections.join('\n\n');
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

