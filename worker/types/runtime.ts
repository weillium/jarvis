import type { RingBuffer, TranscriptChunk } from '../state/ring-buffer';
import type { FactsStore, Fact } from '../state/facts-store';
import type { RealtimeSession } from '../sessions/realtime-session';

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

  // In-memory state
  ringBuffer: RingBuffer;
  factsStore: FactsStore;
  glossaryCache?: Map<string, GlossaryEntry>;

  // Realtime sessions
  transcriptSession?: RealtimeSession;
  cardsSession?: RealtimeSession;
  factsSession?: RealtimeSession;
  transcriptSessionId?: string;
  cardsSessionId?: string;
  factsSessionId?: string;
  transcriptHandlerSession?: RealtimeSession;
  cardsHandlerSession?: RealtimeSession;
  factsHandlerSession?: RealtimeSession;
  pendingTranscriptChunk?: {
    speaker?: string | null;
    sampleRate?: number;
    encoding?: string;
    durationMs?: number;
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
