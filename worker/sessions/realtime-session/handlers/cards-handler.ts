import type { ResponseDoneEvent, ResponseFunctionCallArgumentsDoneEvent, ResponseTextDoneEvent } from 'openai/resources/realtime/realtime';
import { BaseAgentHandler } from './base-handler';
import { extractErrorMessage, mapCardPayload, mapToolCallArguments, safeJsonParse } from '../payload-utils';
import { extractAssistantText } from '../utils';

export class CardsAgentHandler extends BaseAgentHandler {
  handleResponseText(payload: ResponseTextDoneEvent): void {
    if (!payload.text) {
      return;
    }

    const parsed = mapCardPayload(payload.text);
    if (parsed) {
      this.emit('card', parsed);
    }
  }

  handleResponseDone(payload: ResponseDoneEvent): void {
    const assistantText = extractAssistantText(payload);
    if (!assistantText) {
      return;
    }

    const parsedPayload = safeJsonParse<unknown>(assistantText);
    if (parsedPayload === null) {
      return;
    }

    this.emit('response', { raw: parsedPayload });

    const card = mapCardPayload(parsedPayload);
    if (card) {
      this.emit('card', card);
    }
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
      return;
    }

    if (toolCall.type === 'produce_card') {
      const card = toolCall.card;
      this.log(
        'log',
        `produce_card() called: kind="${card.kind}", card_type="${card.card_type}"`,
        { seq: card.source_seq }
      );
      this.emit('card', card);
      await this.sendToolResultSafe(toolCall.callId, {
        success: true,
        card_id: `card_${Date.now()}`,
      });
    }
  }
}

