import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type {
  RealtimeClientEvent,
} from 'openai/resources/realtime/realtime';
import type { RealtimeMessageContext, RealtimeSessionConfig } from './types';
import type { MessageQueueManager } from './message-queue';
import type { HeartbeatManager } from './heartbeat-manager';
import { extractErrorMessage, getLowercaseErrorField } from './payload-utils';

const isInvalidToolCallError = (error: unknown): boolean =>
  getLowercaseErrorField(error, 'message').includes('invalid_tool_call_id');

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

    try {
      await Promise.resolve().then(() => {
        session.send({
          type: 'input_audio_buffer.append',
          audio: chunk.audioBase64,
        } as RealtimeClientEvent);

        this.deps.messageQueue.incrementPendingAudio(
          Math.round((chunk.audioBase64.length * 3) / 4)
        );

        if (chunk.isFinal) {
          session.send({ type: 'input_audio_buffer.commit' } as RealtimeClientEvent);
          session.send({ type: 'response.create' } as RealtimeClientEvent);
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
    this.deps.scheduleReconnect();
  }
}

