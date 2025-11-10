import type {
  RealtimeServerEvent,
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { extractErrorMessage, isRecord } from '../shared/payload-utils';
import type { MessageQueueManager } from '../shared/message-queue';
import type { HeartbeatManager } from './heartbeat-manager';
import type {
  AgentHandler,
  InputAudioTranscriptionDeltaEvent,
  ParsedInputAudioTranscriptionCompletedEvent,
} from '../types';
import type { RealtimeTranscriptionUsageDTO } from '../../../types';

export interface EventRouterHooks {
  onSessionUpdated?: () => void;
}

interface RouterDependencies {
  agentHandler: AgentHandler;
  messageQueue: MessageQueueManager;
  heartbeat: HeartbeatManager;
  classifyRealtimeError: (error: unknown) => 'transient' | 'fatal';
  onLog?: (level: 'log' | 'warn' | 'error', message: string) => void;
  onError?: (error: unknown, classification: 'transient' | 'fatal') => void;
  hooks?: EventRouterHooks;
}

const extractDeltaText = (event: unknown): string | null => {
  if (!isRecord(event)) {
    return null;
  }

  const deltaValue = event['delta'];
  if (isRecord(deltaValue)) {
    const deltaText = deltaValue['text'];
    if (typeof deltaText === 'string' && deltaText.length > 0) {
      return deltaText;
    }
  }

  const outputValue = event['output'];
  if (Array.isArray(outputValue)) {
    for (const item of outputValue) {
      if (!isRecord(item)) {
        continue;
      }
      const content = item['content'];
      if (!Array.isArray(content)) {
        continue;
      }
      for (const entry of content) {
        if (!isRecord(entry)) {
          continue;
        }
        const entryDelta = entry['delta'];
        if (isRecord(entryDelta)) {
          const entryText = entryDelta['text'];
          if (typeof entryText === 'string' && entryText.length > 0) {
            return entryText;
          }
        }
        const entryText = entry['text'];
        if (typeof entryText === 'string' && entryText.length > 0) {
          return entryText;
        }
      }
    }
  }

  const textField = event['text'];
  if (typeof textField === 'string' && textField.length > 0) {
    return textField;
  }

  return null;
};

const readString = (
  record: Record<string, unknown>,
  key: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): string | undefined => {
  const value = record[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  if (!allowEmpty && value.length === 0) {
    return undefined;
  }
  return value;
};

const readFiniteNumber = (
  record: Record<string, unknown>,
  key: string
): number | undefined => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const normalizeTranscriptionDeltaEvent = (
  value: unknown
): InputAudioTranscriptionDeltaEvent | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value['type'] !== 'conversation.item.input_audio_transcription.delta') {
    return null;
  }

  const itemId = readString(value, 'item_id');
  if (!itemId) {
    return null;
  }

  const result: InputAudioTranscriptionDeltaEvent = {
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: itemId,
  };

  const eventId = readString(value, 'event_id');
  if (eventId) {
    result.event_id = eventId;
  }

  if ('content_index' in value) {
    const contentIndex = readFiniteNumber(value, 'content_index');
    if (contentIndex === undefined) {
      return null;
    }
    result.content_index = contentIndex;
  }

  if ('delta' in value) {
    const deltaValue = readString(value, 'delta', { allowEmpty: true });
    if (deltaValue === undefined) {
      return null;
    }
    result.delta = deltaValue;
  }

  return result;
};

const parseUsage = (usage: unknown): RealtimeTranscriptionUsageDTO | undefined => {
  if (!isRecord(usage)) {
    return undefined;
  }

  if (usage['type'] !== 'tokens') {
    return undefined;
  }

  const totalTokens = readFiniteNumber(usage, 'total_tokens');
  if (totalTokens === undefined) {
    return undefined;
  }

  const parsed: RealtimeTranscriptionUsageDTO = {
    type: 'tokens',
    total_tokens: totalTokens,
  };

  const inputTokens = readFiniteNumber(usage, 'input_tokens');
  if (inputTokens !== undefined) {
    parsed.input_tokens = inputTokens;
  }

  const outputTokens = readFiniteNumber(usage, 'output_tokens');
  if (outputTokens !== undefined) {
    parsed.output_tokens = outputTokens;
  }

  const detailsValue = usage['input_token_details'];
  if (isRecord(detailsValue)) {
    const detailRecord: NonNullable<RealtimeTranscriptionUsageDTO['input_token_details']> = {};

    const audioTokens = readFiniteNumber(detailsValue, 'audio_tokens');
    if (audioTokens !== undefined) {
      detailRecord.audio_tokens = audioTokens;
    }

    const textTokens = readFiniteNumber(detailsValue, 'text_tokens');
    if (textTokens !== undefined) {
      detailRecord.text_tokens = textTokens;
    }

    if (Object.keys(detailRecord).length > 0) {
      parsed.input_token_details = detailRecord;
    }
  }

  return parsed;
};

const normalizeTranscriptionCompletedEvent = (
  value: unknown
): ParsedInputAudioTranscriptionCompletedEvent | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value['type'] !== 'conversation.item.input_audio_transcription.completed') {
    return null;
  }

  const itemId = readString(value, 'item_id');
  if (!itemId) {
    return null;
  }

  const result: ParsedInputAudioTranscriptionCompletedEvent = {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: itemId,
  };

  const eventId = readString(value, 'event_id');
  if (eventId) {
    result.event_id = eventId;
  }

  if ('content_index' in value) {
    const contentIndex = readFiniteNumber(value, 'content_index');
    if (contentIndex === undefined) {
      return null;
    }
    result.content_index = contentIndex;
  }

  if ('transcript' in value) {
    const transcriptValue = readString(value, 'transcript', { allowEmpty: true });
    if (transcriptValue === undefined) {
      return null;
    }
    result.transcript = transcriptValue;
  }

  if ('usage' in value) {
    const usage = parseUsage(value['usage']);
    if (!usage) {
      return null;
    }
    result.usage = usage;
  }

  return result;
};

export class EventRouter {
  private readonly deps: RouterDependencies;
  private deltaLogCount = 0;
  private completedLogCount = 0;

  constructor(deps: RouterDependencies) {
    this.deps = deps;
  }

  private log(level: 'log' | 'warn' | 'error', message: string): void {
    this.deps.onLog?.(level, message);
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
      this.deps.hooks?.onSessionUpdated?.();
    }
  }

  handleSessionCreated(): void {
    this.log('log', 'Session created');
  }

  handlePong(): void {
    this.deps.heartbeat.handlePong();
  }

  handleTranscriptionDelta(event: unknown): void {
    const normalized = normalizeTranscriptionDeltaEvent(event);
    if (!normalized) {
      this.log('warn', 'Dropping transcription delta with invalid payload');
      return;
    }

    this.deltaLogCount = (this.deltaLogCount ?? 0) + 1;
    if (this.deltaLogCount <= 5) {
      try {
        this.log('log', `Transcription delta received payload: ${JSON.stringify(normalized)}`);
      } catch {
        this.log('log', 'Transcription delta received payload (failed to stringify)');
      }
    }

    const snippet =
      typeof normalized.delta === 'string' && normalized.delta.length > 0
        ? normalized.delta.slice(0, 80)
        : '<empty>';
    this.log(
      'log',
      `Transcription delta received (item=${normalized.item_id}, idx=${normalized.content_index ?? 0}): ${snippet}`
    );

    void this.deps.agentHandler.handleTranscriptionDelta(normalized);
  }

  handleTranscriptionCompleted(event: unknown): void {
    const normalized = normalizeTranscriptionCompletedEvent(event);
    if (!normalized) {
      this.log('warn', 'Dropping transcription completion with invalid payload');
      return;
    }

    this.completedLogCount = (this.completedLogCount ?? 0) + 1;
    if (this.completedLogCount <= 5) {
      try {
        this.log('log', `Transcription completed payload: ${JSON.stringify(normalized)}`);
      } catch {
        this.log('log', 'Transcription completed payload (failed to stringify)');
      }
    }

    const snippet =
      typeof normalized.transcript === 'string' && normalized.transcript.length > 0
        ? normalized.transcript.slice(0, 80)
        : '<empty>';
    this.log(
      'log',
      `Transcription completed (item=${normalized.item_id}, idx=${normalized.content_index ?? 0}): ${snippet}`
    );

    void this.deps.agentHandler.handleTranscriptionCompleted(normalized);
  }
}

