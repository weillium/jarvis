import type {
  RealtimeServerEvent,
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { extractErrorMessage } from './payload-utils';
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
}

export class EventRouter {
  private readonly deps: RouterDependencies;

  constructor(deps: RouterDependencies) {
    this.deps = deps;
  }

  handleFunctionCall(event: ResponseFunctionCallArgumentsDoneEvent): void {
    void this.deps.agentHandler.handleToolCall(event);
  }

  handleResponseText(event: ResponseTextDoneEvent): void {
    void this.deps.agentHandler.handleResponseText(event);
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
      this.deps.onLog?.('error', baseMessage);
    } else {
      this.deps.onLog?.('warn', `${baseMessage} (transient - retrying)`);
    }

    this.deps.onError?.(error, classification);
  }

  handleGenericEvent(event: RealtimeServerEvent): void {
    if (process.env.DEBUG_REALTIME) {
      console.log(`[realtime] Event: ${event.type}`, event);
    }
    if (event.type === 'session.updated') {
      this.deps.onLog?.('log', 'Session updated');
    }
  }

  handleSessionCreated(): void {
    this.deps.onLog?.('log', 'Session created');
  }

  handlePong(): void {
    this.deps.heartbeat.handlePong();
  }
}

