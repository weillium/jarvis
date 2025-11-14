import type {
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { BaseAgentHandler } from './base-handler';
import { extractErrorMessage } from '../shared/payload-utils';
import {
  interpretResponseDone,
  interpretResponseText,
  interpretToolCall,
} from '../../agent-profiles/cards/runtime-tooling';

export class CardsAgentHandler extends BaseAgentHandler {
  handleResponseText(payload: ResponseTextDoneEvent): void {
    const result = interpretResponseText(payload);
    result.cards.forEach((card) => {
      this.emit('card', card);
    });
  }

  handleResponseDone(payload: ResponseDoneEvent): void {
    const result = interpretResponseDone(payload);
    if (result.rawPayload !== undefined) {
      this.emit('response', { raw: result.rawPayload });
    }
    result.cards.forEach((card) => {
      this.emit('card', card);
    });
  }

  async handleToolCall(payload: ResponseFunctionCallArgumentsDoneEvent): Promise<void> {
    const toolCall = interpretToolCall(payload);
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
      this.log('log', `produce_card() called: template="${card.template_id ?? 'unknown'}", card_type="${card.card_type}"`, {
        seq: card.source_seq,
      });
      this.emit('card', card);
      await this.sendToolResultSafe(toolCall.callId, {
        success: true,
        card_id: `card_${Date.now()}`,
      });
    }
  }
}

