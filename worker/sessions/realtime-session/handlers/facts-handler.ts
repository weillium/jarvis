import type { ResponseDoneEvent, ResponseFunctionCallArgumentsDoneEvent, ResponseTextDoneEvent } from 'openai/resources/realtime/realtime';
import { BaseAgentHandler } from './base-handler';
import { mapFactsPayload, mapToolCallArguments } from '../payload-utils';
import { extractErrorMessage } from '../payload-utils';

export class FactsAgentHandler extends BaseAgentHandler {
  handleResponseText(payload: ResponseTextDoneEvent): void {
    if (!payload.text) {
      return;
    }

    const parsed = mapFactsPayload(payload.text);
    if (parsed.length > 0) {
      this.emitEvent('facts', parsed);
    }
  }

  handleResponseDone(payload: ResponseDoneEvent): void {
    // Facts agent relies on text done events; no additional handling.
  }

  async handleToolCall(payload: ResponseFunctionCallArgumentsDoneEvent): Promise<void> {
    const toolCall = mapToolCallArguments(payload.arguments, payload.call_id);
    if (!toolCall) {
      this.onLog?.('warn', 'Received unsupported tool call arguments');
      return;
    }

    if (toolCall.type === 'retrieve') {
      if (!this.onRetrieve) {
        this.onLog?.('warn', 'retrieve() called but no onRetrieve callback provided');
        await this.sendToolResult(toolCall.callId, { chunks: [] });
        return;
      }

      try {
        const results = await this.onRetrieve(toolCall.query, toolCall.topK);
        await this.sendToolResult(toolCall.callId, {
          chunks: results.map((r) => ({
            id: r.id,
            chunk: r.chunk,
            similarity: r.similarity,
          })),
        });
        this.onLog?.('log', `retrieve() returned ${results.length} chunks`);
      } catch (error: unknown) {
        const message = extractErrorMessage(error);
        this.onLog?.('error', `Error executing retrieve(): ${message}`);
        await this.sendToolResult(toolCall.callId, { error: message, chunks: [] });
      }
    }
  }
}

