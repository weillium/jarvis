import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeClientEvent } from 'openai/resources/realtime/realtime';
import type { RealtimeMessageContext, RealtimeSessionConfig } from './types';
import type { MessageQueueManager } from './message-queue';
import type { HeartbeatManager } from './heartbeat-manager';
import { extractErrorMessage, getLowercaseErrorField } from './payload-utils';

const isInvalidToolCallError = (error: unknown): boolean =>
  getLowercaseErrorField(error, 'message').includes('invalid_tool_call_id');

const PCM_SAMPLE_RATE = 24_000;
const PCM_BYTES_PER_SAMPLE = 2;
const TARGET_CHUNK_DURATION_MS = 150;
const MIN_FLUSH_BYTES = Math.ceil(
  (PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE * TARGET_CHUNK_DURATION_MS) / 1000
);

interface RuntimeControllerDeps {
  config: RealtimeSessionConfig;
  messageQueue: MessageQueueManager;
  heartbeat: HeartbeatManager;
  getSession: () => OpenAIRealtimeWebSocket | undefined;
  isActive: () => boolean;
  setActive: (active: boolean) => void;
  onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ) => void;
  onStatusChange?: (status: 'active' | 'paused' | 'closed' | 'error', sessionId?: string) => void;
  updateDatabaseStatus: (status: 'active' | 'paused' | 'closed' | 'error', sessionId?: string) => Promise<void>;
  safeCloseSession: (reason: string) => void;
  scheduleReconnect: () => void;
}

export class RuntimeController {
  private readonly deps: RuntimeControllerDeps;
  private transcriptPcmBuffer: Buffer = Buffer.alloc(0);

  constructor(deps: RuntimeControllerDeps) {
    this.deps = deps;
  }

  async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    if (!this.deps.isActive()) {
      throw new Error('Session not connected');
    }
    const session = this.deps.getSession();
    if (!session) {
      throw new Error('Session not connected');
    }

    this.deps.messageQueue.enqueue(message, context);
    await this.deps.messageQueue.processQueue();
  }

  async appendAudioChunk(chunk: {
    audioBase64: string;
    isFinal?: boolean;
    sampleRate?: number;
    encoding?: string;
    durationMs?: number;
    speaker?: string;
  }): Promise<void> {
    if (!this.deps.isActive()) {
      throw new Error('Transcript session not connected');
    }
    const session = this.deps.getSession();
    if (!session) {
      throw new Error('Session not connected');
    }

    if (!chunk.audioBase64) {
      throw new Error('audioBase64 is required');
    }

    const isTranscriptAgent = this.deps.config.agentType === 'transcript';
    if (isTranscriptAgent) {
      const incoming = Buffer.from(chunk.audioBase64, 'base64');
      if (incoming.length > 0) {
        this.transcriptPcmBuffer = Buffer.concat([this.transcriptPcmBuffer, incoming]);
      }
    }

    try {
      await Promise.resolve().then(() => {
        if (!isTranscriptAgent) {
          session.send({
            type: 'input_audio_buffer.append',
            audio: chunk.audioBase64,
          } as RealtimeClientEvent);

          const appendedBytes = Math.round((chunk.audioBase64.length * 3) / 4);
          if (appendedBytes > 0) {
            this.deps.messageQueue.incrementPendingAudio(appendedBytes);
          }

          if (chunk.isFinal) {
            if (this.deps.messageQueue.hasPendingAudio()) {
              session.send({ type: 'input_audio_buffer.commit' } as RealtimeClientEvent);
              session.send({ type: 'response.create' } as RealtimeClientEvent);
              this.deps.messageQueue.resetPendingAudio();
            } else {
              this.deps.onLog?.('warn', 'Skipping audio commit: no buffered audio');
            }
          }
          return;
        }

        while (this.transcriptPcmBuffer.length >= MIN_FLUSH_BYTES) {
          const flushBuffer = this.transcriptPcmBuffer.subarray(0, MIN_FLUSH_BYTES);
          this.transcriptPcmBuffer = this.transcriptPcmBuffer.subarray(MIN_FLUSH_BYTES);
          session.send({
            type: 'input_audio_buffer.append',
            audio: flushBuffer.toString('base64'),
          } as RealtimeClientEvent);
          session.send({ type: 'input_audio_buffer.commit' } as RealtimeClientEvent);
          this.deps.onLog?.(
            'log',
            `Flushed ${MIN_FLUSH_BYTES} bytes (~${TARGET_CHUNK_DURATION_MS} ms) to transcript session`
          );
        }

        if (chunk.isFinal) {
          if (this.transcriptPcmBuffer.length > 0) {
            session.send({
              type: 'input_audio_buffer.append',
              audio: this.transcriptPcmBuffer.toString('base64'),
            } as RealtimeClientEvent);
            session.send({ type: 'input_audio_buffer.commit' } as RealtimeClientEvent);
            this.deps.onLog?.(
              'log',
              `Flushed remaining ${this.transcriptPcmBuffer.length} bytes to transcript session`
            );
            this.transcriptPcmBuffer = Buffer.alloc(0);
          } else {
            this.deps.onLog?.('warn', 'Transcript stream ended with empty buffer');
          }
          this.deps.messageQueue.resetPendingAudio();
        }
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error);
      this.deps.onLog?.('error', `Error appending audio chunk: ${message}`);
      throw error;
    }
  }

  async sendToolResult(callId: string, output: Record<string, unknown>): Promise<void> {
    if (!this.deps.isActive()) {
      this.deps.onLog?.('warn', 'Skipping tool output - session inactive');
      return;
    }
    const session = this.deps.getSession();
    if (!session) {
      this.deps.onLog?.('warn', 'Skipping tool output - session not available');
      return;
    }

    try {
      await Promise.resolve().then(() => {
        session.send({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(output),
          },
        } as RealtimeClientEvent);
      });
    } catch (error: unknown) {
      if (isInvalidToolCallError(error)) {
        this.deps.onLog?.(
          'warn',
          `Ignoring tool output for expired call_id ${callId}`
        );
        return;
      }
      throw error;
    }
  }

  handleTransientError(): void {
    this.deps.setActive(false);
    this.deps.messageQueue.restoreCurrentMessage();
    this.deps.heartbeat.stop();
    this.deps.onStatusChange?.('paused');
    void this.deps.updateDatabaseStatus('paused');
    this.deps.safeCloseSession('Transient error - reconnecting');
    this.transcriptPcmBuffer = Buffer.alloc(0);
    this.deps.scheduleReconnect();
  }

}

