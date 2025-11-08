import type {
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { BaseAgentHandler } from './base-handler';
import { extractAssistantText } from '../utils';

export class TranscriptAgentHandler extends BaseAgentHandler {
  handleResponseText(payload: ResponseTextDoneEvent): void {
    const text = payload.text?.trim() ?? '';
    if (text.length === 0) {
      return;
    }

    this.emit('transcript', {
      text,
      isFinal: true,
      receivedAt: new Date().toISOString(),
    });
  }

  handleResponseDone(payload: ResponseDoneEvent): void {
    const assistantText = extractAssistantText(payload);
    if (!assistantText) {
      return;
    }

    const text = assistantText.trim();
    if (text.length === 0) {
      return;
    }

    this.emit('transcript', {
      text,
      isFinal: true,
      receivedAt: new Date().toISOString(),
    });
  }

  handleToolCall(payload: ResponseFunctionCallArgumentsDoneEvent): void {
    void payload;
    // Transcript agent currently does not support tool calls.
  }
}

