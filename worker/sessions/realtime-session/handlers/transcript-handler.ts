import type {
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import { BaseAgentHandler } from './base-handler';
import type {
  InputAudioTranscriptionCompletedEvent,
  InputAudioTranscriptionDeltaEvent,
} from '../types';

export class TranscriptAgentHandler extends BaseAgentHandler {
  private partialBuffer = '';

  handleResponseText(payload: ResponseTextDoneEvent): void {
    void payload;
  }

  handleResponseDone(payload: ResponseDoneEvent): void {
    void payload;
  }

  handleToolCall(payload: ResponseFunctionCallArgumentsDoneEvent): void {
    void payload;
    // Transcript agent currently does not support tool calls.
  }

  handleResponseTextDelta(payload: { text: string; receivedAt: string }): void {
    void payload;
  }

  handleTranscriptionDelta(event: InputAudioTranscriptionDeltaEvent): void {
    const delta = typeof event.delta === 'string' ? event.delta : '';
    if (delta.length === 0) {
      return;
    }

    this.partialBuffer += delta;

    this.emit('transcript', {
      text: this.partialBuffer,
      isFinal: false,
      receivedAt: new Date().toISOString(),
    });
  }

  handleTranscriptionCompleted(event: InputAudioTranscriptionCompletedEvent): void {
    const transcript = typeof event.transcript === 'string' ? event.transcript.trim() : '';
    if (transcript.length === 0) {
      return;
    }

    this.emit('transcript', {
      text: transcript,
      isFinal: true,
      receivedAt: new Date().toISOString(),
    });

    this.partialBuffer = '';
  }
}

