import { EventRuntime, TranscriptChunk } from '../types';
import { RingBuffer } from '../state/ring-buffer';
import { FactsStore } from '../state/facts-store';
import { SupabaseService } from '../services/supabase-service';
import { GlossaryManager } from '../context/glossary-manager';
import { CheckpointManager } from '../monitoring/checkpoint-manager';
import { MetricsCollector } from '../monitoring/metrics-collector';
import { Logger } from '../monitoring/logger';

export class RuntimeManager {
  private readonly runtimes: Map<string, EventRuntime> = new Map();

  constructor(
    private readonly supabase: SupabaseService,
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
    this.logger.clearLogs(eventId, 'cards');
    this.logger.clearLogs(eventId, 'facts');

    // Load active facts from database
    const factsStore = new FactsStore(50);
    const activeFacts = await this.supabase.getFacts(eventId, true);
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
      
      // Mark any evicted facts as inactive in database
      if (evictedKeys.length > 0) {
        await this.supabase.updateFactActiveStatus(eventId, evictedKeys, false);
        console.log(`[runtime-manager] Loaded ${activeFacts.length} active facts, evicted ${evictedKeys.length} facts (capacity limit)`);
      } else {
        console.log(`[runtime-manager] Loaded ${activeFacts.length} active facts into FactsStore for event ${eventId}`);
      }
    }

    const runtime: EventRuntime = {
      eventId,
      agentId,
      status: 'context_complete',
      ringBuffer: new RingBuffer(1000, 5 * 60 * 1000),
      factsStore,
      glossaryCache,
      cardsLastSeq: checkpoints.cards,
      factsLastSeq: checkpoints.facts,
      factsLastUpdate: Date.now(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.runtimes.set(eventId, runtime);
    return runtime;
  }

  async replayTranscripts(runtime: EventRuntime): Promise<void> {
    const transcripts = await this.supabase.getTranscriptsForReplay(
      runtime.eventId,
      Math.max(runtime.cardsLastSeq, runtime.factsLastSeq),
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
    runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, lastSeq);
    runtime.factsLastSeq = Math.max(runtime.factsLastSeq, lastSeq);
  }

  async resumeExistingEvents(limit: number = 50): Promise<EventRuntime[]> {
    const agents = await this.supabase.getAgentsByStatus('running', limit);
    if (!agents.length) {
      return [];
    }

    const runtimes: EventRuntime[] = [];
    for (const agent of agents) {
      try {
        const runtime = await this.createRuntime(agent.event_id, agent.id);
        await this.replayTranscripts(runtime);
        runtimes.push(runtime);
      } catch (error: any) {
        console.error(
          `[runtime-manager] Error resuming event ${agent.event_id}: ${error.message}`
        );
      }
    }

    return runtimes;
  }
}
