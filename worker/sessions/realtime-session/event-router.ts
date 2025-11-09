import type {
  RealtimeServerEvent,
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { extractErrorMessage } from './payload-utils';
import type { MessageQueueManager } from './message-queue';
import type { HeartbeatManager } from './heartbeat-manager';
import type {
  AgentHandler,
  InputAudioTranscriptionCompletedEvent,
  InputAudioTranscriptionDeltaEvent,
} from './types';

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

  handleTranscriptionDelta(event: InputAudioTranscriptionDeltaEvent): void {
    if (typeof this.deps.agentHandler.handleTranscriptionDelta !== 'function') {
      return;
    }
    const handler = this.deps.agentHandler
      .handleTranscriptionDelta as (
      payload: InputAudioTranscriptionDeltaEvent
    ) => Promise<void> | void;
    void handler.call(this.deps.agentHandler, event);
  }

  handleTranscriptionCompleted(event: InputAudioTranscriptionCompletedEvent): void {
    if (typeof this.deps.agentHandler.handleTranscriptionCompleted !== 'function') {
      return;
    }
    const handler = this.deps.agentHandler
      .handleTranscriptionCompleted as (
      payload: InputAudioTranscriptionCompletedEvent
    ) => Promise<void> | void;
    void handler.call(this.deps.agentHandler, event);
  }
}

