import type {
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import type {
  AgentHandler,
  AgentHandlerOptions,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
} from '../types';
import type { VectorMatchRecord } from '../../../types';

type LogLevel = 'log' | 'warn' | 'error';

export abstract class BaseAgentHandler implements AgentHandler {
  protected readonly context: AgentHandlerOptions['context'];
  protected readonly tokenBudget?: AgentHandlerOptions['tokenBudget'];

  private readonly emitEventFn: AgentHandlerOptions['emitEvent'];
  private readonly sendToolResultFn: AgentHandlerOptions['sendToolResult'];
  private readonly logFn?: AgentHandlerOptions['onLog'];
  private readonly retrieveFn?: AgentHandlerOptions['onRetrieve'];
  private readonly embedFn?: AgentHandlerOptions['embedText'];

  constructor(options: AgentHandlerOptions) {
    this.context = options.context;
    this.tokenBudget = options.tokenBudget;
    this.emitEventFn = options.emitEvent;
    this.sendToolResultFn = options.sendToolResult;
    this.logFn = typeof options.onLog === 'function' ? options.onLog : undefined;
    this.retrieveFn = typeof options.onRetrieve === 'function' ? options.onRetrieve : undefined;
    this.embedFn = typeof options.embedText === 'function' ? options.embedText : undefined;
  }

  protected emit<K extends RealtimeSessionEvent>(
    event: K,
    payload: RealtimeSessionEventPayloads[K]
  ): void {
    this.emitEventFn(event, payload);
  }

  protected log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    this.logFn?.(level, message, meta);
  }

  protected async sendToolResultSafe(callId: string, output: Record<string, unknown>): Promise<void> {
    await this.sendToolResultFn(callId, output);
  }

  protected getRetriever():
    | ((query: string, topK: number) => Promise<VectorMatchRecord[]>)
    | undefined {
    return this.retrieveFn;
  }

  protected getEmbedder(): ((text: string) => Promise<number[]>) | undefined {
    return this.embedFn;
  }

  abstract handleResponseText(payload: ResponseTextDoneEvent): Promise<void> | void;

  abstract handleResponseDone(payload: ResponseDoneEvent): Promise<void> | void;

  abstract handleToolCall(
    payload: ResponseFunctionCallArgumentsDoneEvent
  ): Promise<void> | void;
}

