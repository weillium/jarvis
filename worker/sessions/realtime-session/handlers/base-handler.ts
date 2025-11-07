import type { ResponseDoneEvent, ResponseFunctionCallArgumentsDoneEvent, ResponseTextDoneEvent } from 'openai/resources/realtime/realtime';
import type { AgentHandler, AgentHandlerOptions } from '../types';

export abstract class BaseAgentHandler implements AgentHandler {
  protected readonly context: AgentHandlerOptions['context'];
  protected readonly onLog?: AgentHandlerOptions['onLog'];
  protected readonly emitEvent: AgentHandlerOptions['emitEvent'];
  protected readonly sendToolResult: AgentHandlerOptions['sendToolResult'];
  protected readonly onRetrieve?: AgentHandlerOptions['onRetrieve'];
  protected readonly embedText?: AgentHandlerOptions['embedText'];
  protected readonly tokenBudget?: AgentHandlerOptions['tokenBudget'];

  constructor(options: AgentHandlerOptions) {
    this.context = options.context;
    this.onLog = options.onLog;
    this.emitEvent = options.emitEvent;
    this.sendToolResult = options.sendToolResult;
    this.onRetrieve = options.onRetrieve;
    this.embedText = options.embedText;
    this.tokenBudget = options.tokenBudget;
  }

  abstract handleResponseText(payload: ResponseTextDoneEvent): Promise<void> | void;

  abstract handleResponseDone(payload: ResponseDoneEvent): Promise<void> | void;

  abstract handleToolCall(payload: ResponseFunctionCallArgumentsDoneEvent): Promise<void> | void;
}

