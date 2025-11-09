import type { RingBuffer, TranscriptChunk } from '../state/ring-buffer';
import type { FactsStore, Fact } from '../state/facts-store';
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

  // In-memory state
  ringBuffer: RingBuffer;
  factsStore: FactsStore;
  glossaryCache?: Map<string, GlossaryEntry>;

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

  // Debouncing for Facts agent
  factsUpdateTimer?: NodeJS.Timeout;
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

export interface AgentSelection {
  transcript: boolean;
  cards: boolean;
  facts: boolean;
}
