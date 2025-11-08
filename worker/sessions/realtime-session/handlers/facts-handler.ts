import type { ResponseDoneEvent, ResponseFunctionCallArgumentsDoneEvent, ResponseTextDoneEvent } from 'openai/resources/realtime/realtime';
import { BaseAgentHandler } from './base-handler';
import { extractErrorMessage, mapFactsPayload, mapToolCallArguments } from '../payload-utils';
import { extractAssistantText } from '../utils';

export class FactsAgentHandler extends BaseAgentHandler {
  handleResponseText(payload: ResponseTextDoneEvent): void {
    if (!payload.text) {
      return;
    }

    const parsed = mapFactsPayload(payload.text);
    if (parsed.length > 0) {
      this.emit('facts', parsed);
    }
  }

  handleResponseDone(payload: ResponseDoneEvent): void {
    const assistantText = extractAssistantText(payload);
    if (!assistantText) {
      return;
    }

    const parsed = mapFactsPayload(assistantText);
    if (parsed.length === 0) {
      return;
    }

    this.emit('facts', parsed);
  }

  async handleToolCall(payload: ResponseFunctionCallArgumentsDoneEvent): Promise<void> {
    const toolCall = mapToolCallArguments(payload.arguments, payload.call_id);
    if (!toolCall) {
      this.log('warn', 'Received unsupported tool call arguments');
      return;
    }

    if (toolCall.type === 'retrieve') {
      try {
        const retriever = this.getRetriever();
        if (!retriever) {
          this.log('warn', 'retrieve() called but no onRetrieve callback provided');
          await this.sendToolResultSafe(toolCall.callId, { chunks: [] });
          return;
        }

        const results = await retriever(toolCall.query, toolCall.topK);
        const chunks = results.map((record) => ({
          id: record.id,
          chunk: record.chunk,
          similarity: record.similarity,
        }));

        await this.sendToolResultSafe(toolCall.callId, { chunks });
        this.log('log', `retrieve() returned ${results.length} chunks`);
      } catch (error: unknown) {
        const message = extractErrorMessage(error);
        this.log('error', `Error executing retrieve(): ${message}`);
        await this.sendToolResultSafe(toolCall.callId, { error: message, chunks: [] });
      }
    }
  }
}

