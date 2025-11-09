import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RealtimeCardDTO,
  RealtimeFactDTO,
  RealtimeModelResponseDTO,
  RealtimeTranscriptionUsageDTO,
  RealtimeTranscriptDTO,
  VectorMatchRecord,
  Fact,
} from '../../types';
export type { RealtimeModelResponseDTO } from '../../types';
import type {
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import type { TokenBudget } from './shared/tokens';

export type AgentType = 'transcript' | 'cards' | 'facts';

export type AgentSessionLifecycleStatus = 'active' | 'paused' | 'closed' | 'error';

export interface RealtimeSessionConfig {
  eventId: string;
  agentType: AgentType;
  model?: string;
  onStatusChange?: (
    status: AgentSessionLifecycleStatus,
    sessionId?: string
  ) => void;
  onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ) => void;
  supabase?: SupabaseClient;
  onRetrieve?: (query: string, topK: number) => Promise<VectorMatchRecord[]>;
  embedText?: (text: string) => Promise<number[]>;
  tokenBudget?: TokenBudget;
}

export interface RealtimeSessionStatus {
  isActive: boolean;
  queueLength: number;
  websocketState?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  connectionUrl?: string;
  sessionId?: string;
  connectedAt?: string;
  pingPong?: {
    enabled: boolean;
    missedPongs: number;
    lastPongReceived?: string;
    pingIntervalMs: number;
    pongTimeoutMs: number;
    maxMissedPongs: number;
  };
}

export interface RealtimeMessageContext {
  bullets?: string[];
  glossaryContext?: string;
  recentText?: string;
  facts?: Fact[] | Record<string, unknown>;
  sourceSeq?: number;
}

export type RealtimeSessionEvent = 'card' | 'response' | 'facts' | 'transcript' | 'error';

export type RealtimeSessionEventPayloads = {
  card: RealtimeCardDTO;
  response: RealtimeModelResponseDTO;
  facts: RealtimeFactDTO[];
  transcript: RealtimeTranscriptDTO;
  error: Error;
};

export interface InputAudioTranscriptionDeltaEvent {
  event_id?: string;
  type: 'conversation.item.input_audio_transcription.delta';
  item_id: string;
  content_index?: number;
  delta?: string;
}

export interface InputAudioTranscriptionCompletedEvent {
  event_id?: string;
  type: 'conversation.item.input_audio_transcription.completed';
  item_id: string;
  content_index?: number;
  transcript?: string;
  usage?: RealtimeTranscriptionUsageDTO;
}

export interface ParsedInputAudioTranscriptionCompletedEvent {
  event_id?: string;
  type: 'conversation.item.input_audio_transcription.completed';
  item_id: string;
  content_index?: number;
  transcript?: string;
  usage?: RealtimeTranscriptionUsageDTO;
}

export interface RealtimeAgentContext {
  eventId: string;
  agentType: AgentType;
  model?: string;
}

export interface AgentHandlerOptions {
  context: RealtimeAgentContext;
  onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  emitEvent: <K extends RealtimeSessionEvent>(event: K, payload: RealtimeSessionEventPayloads[K]) => void;
  sendToolResult: (callId: string, output: Record<string, unknown>) => Promise<void>;
  onRetrieve?: (query: string, topK: number) => Promise<VectorMatchRecord[]>;
  embedText?: (text: string) => Promise<number[]>;
  tokenBudget?: TokenBudget;
}

export interface AgentHandler {
  handleResponseText: (payload: ResponseTextDoneEvent) => Promise<void> | void;
  handleResponseDone: (payload: ResponseDoneEvent) => Promise<void> | void;
  handleToolCall: (payload: ResponseFunctionCallArgumentsDoneEvent) => Promise<void> | void;
  handleResponseTextDelta: (payload: { text: string; receivedAt: string }) => Promise<void> | void;
  handleTranscriptionDelta: (
    payload: InputAudioTranscriptionDeltaEvent
  ) => Promise<void> | void;
  handleTranscriptionCompleted: (
    payload: ParsedInputAudioTranscriptionCompletedEvent
  ) => Promise<void> | void;
}

export interface RealtimeAudioChunk {
  audioBase64: string;
  isFinal?: boolean;
  sampleRate?: number;
  bytesPerSample?: number;
  encoding?: string;
  durationMs?: number;
  speaker?: string;
}

export interface AgentRealtimeSession {
  connect(): Promise<string>;
  pause(): Promise<void>;
  resume(): Promise<string>;
  close(): Promise<void>;
  getStatus(): RealtimeSessionStatus;
  notifyStatus(status: AgentSessionLifecycleStatus, sessionId?: string): void;
  on<K extends RealtimeSessionEvent>(
    event: K,
    handler: (payload: RealtimeSessionEventPayloads[K]) => void
  ): void;
  sendMessage(message: string, context?: RealtimeMessageContext): Promise<void>;
  appendAudioChunk(chunk: RealtimeAudioChunk): Promise<void>;
}
