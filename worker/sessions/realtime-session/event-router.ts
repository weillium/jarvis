import type {
  RealtimeServerEvent,
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { extractErrorMessage, isRecord } from './payload-utils';
import type { MessageQueueManager } from './message-queue';
import type { HeartbeatManager } from './heartbeat-manager';
import type { AgentHandler } from './types';

interface RouterDependencies {
  agentHandler: AgentHandler;
  messageQueue: MessageQueueManager;
  heartbeat: HeartbeatManager;
  classifyRealtimeError: (error: unknown) => 'transient' | 'fatal';
  onLog?: (level: 'log' | 'warn' | 'error', message: string) => void;
  onError?: (error: unknown, classification: 'transient' | 'fatal') => void;
  onSessionUpdated?: () => void;
}

const extractDeltaText = (event: unknown): string | null => {
  if (typeof event !== 'object' || event === null) {
    return null;
  }

  const record = event as Record<string, unknown>;

  const delta = record.delta;
  if (typeof delta === 'object' && delta !== null) {
    const deltaRecord = delta as Record<string, unknown>;
    const deltaText = deltaRecord.text;
    if (typeof deltaText === 'string' && deltaText.length > 0) {
      return deltaText;
    }
  }

  const output = record.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const itemRecord = item as Record<string, unknown>;
      const content = itemRecord.content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const entry of content) {
        if (typeof entry !== 'object' || entry === null) {
          continue;
        }
        const entryRecord = entry as Record<string, unknown>;
        const entryDelta = entryRecord.delta;
        if (typeof entryDelta === 'object' && entryDelta !== null) {
          const entryDeltaRecord = entryDelta as Record<string, unknown>;
          const entryText = entryDeltaRecord.text;
          if (typeof entryText === 'string' && entryText.length > 0) {
            return entryText;
          }
        }
        const entryText = entryRecord.text;
        if (typeof entryText === 'string' && entryText.length > 0) {
          return entryText;
        }
      }
    }
  }

  const textField = record.text;
  if (typeof textField === 'string' && textField.length > 0) {
    return textField;
  }

  return null;
};

interface RawInputAudioTranscriptionDeltaEvent {
  type?: unknown;
  item_id?: unknown;
  event_id?: unknown;
  content_index?: unknown;
  delta?: unknown;
}

interface RawInputAudioTranscriptionCompletedEvent {
  type?: unknown;
  item_id?: unknown;
  event_id?: unknown;
  content_index?: unknown;
  transcript?: unknown;
}

type NormalizedInputAudioTranscriptionDeltaEvent = {
  event_id?: string;
  type: 'conversation.item.input_audio_transcription.delta';
  item_id: string;
  content_index?: number;
  delta?: string;
};

type NormalizedInputAudioTranscriptionCompletedEvent = {
  event_id?: string;
  type: 'conversation.item.input_audio_transcription.completed';
  item_id: string;
  content_index?: number;
  transcript?: string;
};

const hasTranscriptionDeltaHandler = (
  handler: AgentHandler
): handler is AgentHandler & {
  handleTranscriptionDelta: (
    payload: NormalizedInputAudioTranscriptionDeltaEvent
  ) => Promise<void> | void;
} => typeof (handler as { handleTranscriptionDelta?: unknown }).handleTranscriptionDelta === 'function';

const hasTranscriptionCompletedHandler = (
  handler: AgentHandler
): handler is AgentHandler & {
  handleTranscriptionCompleted: (
    payload: NormalizedInputAudioTranscriptionCompletedEvent
  ) => Promise<void> | void;
} => typeof (handler as { handleTranscriptionCompleted?: unknown }).handleTranscriptionCompleted === 'function';

const parseInputAudioTranscriptionDeltaEvent = (
  event: unknown
): NormalizedInputAudioTranscriptionDeltaEvent | null => {
  if (!isRecord(event)) {
    return null;
  }

  const record = event as RawInputAudioTranscriptionDeltaEvent;

  if (record.type !== 'conversation.item.input_audio_transcription.delta') {
    return null;
  }

  const itemId = record.item_id;
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return null;
  }

  const eventId =
    typeof record.event_id === 'string' && record.event_id.length > 0 ? record.event_id : undefined;

  const hasContentIndex = record.content_index !== undefined;
  if (
    hasContentIndex &&
    (typeof record.content_index !== 'number' || !Number.isFinite(record.content_index))
  ) {
    return null;
  }
  const contentIndex =
    typeof record.content_index === 'number' && Number.isFinite(record.content_index)
      ? record.content_index
      : undefined;

  const hasDelta = record.delta !== undefined;
  if (hasDelta && typeof record.delta !== 'string') {
    return null;
  }
  const delta = typeof record.delta === 'string' ? record.delta : undefined;

  const parsed: NormalizedInputAudioTranscriptionDeltaEvent = {
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: itemId,
  };

  if (eventId) {
    parsed.event_id = eventId;
  }
  if (contentIndex !== undefined) {
    parsed.content_index = contentIndex;
  }
  if (delta !== undefined) {
    parsed.delta = delta;
  }

  return parsed;
};

const parseInputAudioTranscriptionCompletedEvent = (
  event: unknown
): NormalizedInputAudioTranscriptionCompletedEvent | null => {
  if (!isRecord(event)) {
    return null;
  }

  const record = event as RawInputAudioTranscriptionCompletedEvent;

  if (record.type !== 'conversation.item.input_audio_transcription.completed') {
    return null;
  }

  const itemId = record.item_id;
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return null;
  }

  const eventId =
    typeof record.event_id === 'string' && record.event_id.length > 0 ? record.event_id : undefined;

  const hasContentIndex = record.content_index !== undefined;
  if (
    hasContentIndex &&
    (typeof record.content_index !== 'number' || !Number.isFinite(record.content_index))
  ) {
    return null;
  }
  const contentIndex =
    typeof record.content_index === 'number' && Number.isFinite(record.content_index)
      ? record.content_index
      : undefined;

  const hasTranscript = record.transcript !== undefined;
  if (hasTranscript && typeof record.transcript !== 'string') {
    return null;
  }
  const transcript = typeof record.transcript === 'string' ? record.transcript : undefined;

  const parsed: NormalizedInputAudioTranscriptionCompletedEvent = {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: itemId,
  };

  if (eventId) {
    parsed.event_id = eventId;
  }
  if (contentIndex !== undefined) {
    parsed.content_index = contentIndex;
  }
  if (transcript !== undefined) {
    parsed.transcript = transcript;
  }

  return parsed;
};

export class EventRouter {
  private readonly deps: RouterDependencies;

  constructor(deps: RouterDependencies) {
    this.deps = deps;
  }

  private log(level: 'log' | 'warn' | 'error', message: string): void {
    const timestamped = `[${new Date().toISOString()}] ${message}`;
    this.deps.onLog?.(level, timestamped);
  }

  handleFunctionCall(event: ResponseFunctionCallArgumentsDoneEvent): void {
    void this.deps.agentHandler.handleToolCall(event);
  }

  handleResponseText(event: ResponseTextDoneEvent): void {
    void this.deps.agentHandler.handleResponseText(event);
  }

  handleResponseTextDelta(event: unknown): void {
    const text = extractDeltaText(event);
    if (!text) {
      return;
    }

    const receivedAt = new Date().toISOString();
    const handler = this.deps.agentHandler.handleResponseTextDelta as (
      payload: { text: string; receivedAt: string }
    ) => Promise<void> | void;

    void handler({
      text,
      receivedAt,
    });
  }

  handleResponseDone(event: ResponseDoneEvent): void {
    void this.deps.agentHandler.handleResponseDone(event);
    this.deps.messageQueue.markResponseComplete();
    void this.deps.messageQueue.processQueue();
  }

  handleError(error: unknown): void {
    const classification = this.deps.classifyRealtimeError(error);
    const baseMessage = `Session error: ${extractErrorMessage(error)}`;

    if (classification === 'fatal') {
      this.log('error', baseMessage);
    } else {
      this.log('warn', `${baseMessage} (transient - retrying)`);
    }

    this.deps.onError?.(error, classification);
  }

  handleGenericEvent(event: RealtimeServerEvent): void {
    if (process.env.DEBUG_REALTIME) {
      console.log(`[realtime] Event: ${event.type}`, event);
    }
    if (event.type === 'session.updated') {
      this.log('log', 'Session updated');
      this.deps.onSessionUpdated?.();
    }
  }

  handleSessionCreated(): void {
    this.log('log', 'Session created');
  }

  handlePong(): void {
    this.deps.heartbeat.handlePong();
  }

  handleTranscriptionDelta(event: unknown): void {
    if (!hasTranscriptionDeltaHandler(this.deps.agentHandler)) {
      return;
    }

    const parsed = parseInputAudioTranscriptionDeltaEvent(event);
    if (!parsed) {
      this.log('warn', 'Dropping transcription delta with invalid payload');
      return;
    }

    const snippet =
      typeof parsed.delta === 'string' && parsed.delta.length > 0 ? parsed.delta.slice(0, 80) : '<empty>';
    this.log(
      'log',
      `Transcription delta received (item=${parsed.item_id}, idx=${parsed.content_index ?? 0}): ${snippet}`
    );

    void this.deps.agentHandler.handleTranscriptionDelta(parsed);
  }

  handleTranscriptionCompleted(event: unknown): void {
    if (!hasTranscriptionCompletedHandler(this.deps.agentHandler)) {
      return;
    }

    const parsed = parseInputAudioTranscriptionCompletedEvent(event);
    if (!parsed) {
      this.log('warn', 'Dropping transcription completion with invalid payload');
      return;
    }

    const snippet =
      typeof parsed.transcript === 'string' && parsed.transcript.length > 0
        ? parsed.transcript.slice(0, 80)
        : '<empty>';
    this.log(
      'log',
      `Transcription completed (item=${parsed.item_id}, idx=${parsed.content_index ?? 0}): ${snippet}`
    );

    void this.deps.agentHandler.handleTranscriptionCompleted(parsed);
  }
}

