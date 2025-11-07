import type { ResponseDoneEvent, ResponseFunctionCallArgumentsDoneEvent, ResponseTextDoneEvent } from 'openai/resources/realtime/realtime';
import { BaseAgentHandler } from './base-handler';
import { mapCardPayload, mapToolCallArguments } from '../payload-utils';
import { extractErrorMessage } from '../payload-utils';

export class CardsAgentHandler extends BaseAgentHandler {
  async handleResponseText(payload: ResponseTextDoneEvent): Promise<void> {
    if (!payload.text) {
      return;
    }

    const parsed = mapCardPayload(payload.text);
    if (parsed) {
      this.emitEvent('card', parsed);
    }
  }

  handleResponseDone(payload: ResponseDoneEvent): void {
    // Fallback: cards agents rely on text done; no-op here.
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
      return;
    }

    if (toolCall.type === 'produce_card') {
      const card = toolCall.card;
      this.onLog?.(
        'log',
        `produce_card() called: kind="${card.kind}", card_type="${card.card_type}"`,
        { seq: card.source_seq }
      );
      this.emitEvent('card', card);
      await this.sendToolResult(toolCall.callId, {
        success: true,
        card_id: `card_${Date.now()}`,
      });
    }
  }
}

