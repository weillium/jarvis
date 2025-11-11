import type { RingBuffer, TranscriptChunk } from '../state/ring-buffer';
import type { FactsStore, Fact } from '../state/facts-store';
import type { CardsStore, CardRecord } from '../state/cards-store';
import type { AgentRealtimeSession } from '../sessions/session-adapters';

export type EventRuntimeStatus =
  | 'prepping'
  | 'context_complete'
  | 'ready'
  | 'running'
  | 'ended'
  | 'error';

export interface GlossaryEntry {
  term: string;
  definition: string;
  acronym_for?: string;
  category?: string;
  usage_examples?: string[];
  related_terms?: string[];
  confidence_score?: number;
}

export interface EventRuntime {
  eventId: string;
  agentId: string;
  status: EventRuntimeStatus;
  enabledAgents: AgentSelection;
  logCounters: Record<string, number>;

  // In-memory state
  ringBuffer: RingBuffer;
  factsStore: FactsStore;
  cardsStore: CardsStore;
  glossaryCache?: Map<string, GlossaryEntry>;
  pendingCardConcepts: Map<number, PendingCardConcept>;
  pendingFactSources: Array<{ seq: number; transcriptId: number }>;
  cardsLastTriggeredAt?: number;
  cardsRateHistory?: number[];

  // Realtime sessions
  transcriptSession?: AgentRealtimeSession;
  cardsSession?: AgentRealtimeSession;
  factsSession?: AgentRealtimeSession;
  transcriptSessionId?: string;
  cardsSessionId?: string;
  factsSessionId?: string;
  transcriptHandlerSession?: AgentRealtimeSession;
  cardsHandlerSession?: AgentRealtimeSession;
  factsHandlerSession?: AgentRealtimeSession;
  pendingTranscriptChunk?: {
    speaker?: string | null;
    sampleRate?: number;
    bytesPerSample?: number;
    encoding?: string;
    durationMs?: number;
  };
  streamingTranscript?: {
    seq: number;
    speaker?: string | null;
  };

  // Checkpoints
  transcriptLastSeq: number;
  cardsLastSeq: number;
  factsLastSeq: number;

  factsLastUpdate: number;

  // Periodic summary timer
  summaryTimer?: NodeJS.Timeout;

  // Status update timer
  statusUpdateTimer?: NodeJS.Timeout;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type { TranscriptChunk, Fact };
export type { CardRecord };

export interface PendingCardConcept {
  conceptId: string;
  conceptLabel: string;
  triggeredAt: number;
}

export interface AgentSelection {
  transcript: boolean;
  cards: boolean;
  facts: boolean;
}
