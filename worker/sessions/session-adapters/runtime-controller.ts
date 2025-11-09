import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeClientEvent } from 'openai/resources/realtime/realtime';
import type {
  AgentSessionLifecycleStatus,
  RealtimeAudioChunk,
  RealtimeMessageContext,
  RealtimeSessionConfig,
} from './types';
import type { MessageQueueManager } from './message-queue';
import type { HeartbeatManager } from './heartbeat-manager';
import { getLowercaseErrorField } from './payload-utils';

const isInvalidToolCallError = (error: unknown): boolean =>
  getLowercaseErrorField(error, 'message').includes('invalid_tool_call_id');

const TARGET_CHUNK_DURATION_MS = 150;
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_BYTES_PER_SAMPLE = 2;
const DEFAULT_ENCODING = 'pcm_s16le';

interface AudioFormat {
  sampleRate: number;
  bytesPerSample: number;
  encoding: string;
}

export interface RuntimeControllerHookContext {
  config: RealtimeSessionConfig;
  getSession: () => OpenAIRealtimeWebSocket | undefined;
  isActive: () => boolean;
  messageQueue: MessageQueueManager;
  log: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>
  ) => void;
}

export interface RuntimeControllerHooks {
  appendAudioChunk: (chunk: RealtimeAudioChunk) => Promise<void> | void;
  handleSessionClosed?: (reason: string) => void;
  handleTransientError?: () => void;
  markReady?: () => void;
}

export type RuntimeControllerHooksFactory = (
  context: RuntimeControllerHookContext
) => RuntimeControllerHooks;

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
    context?: Record<string, unknown>
  ) => void;
  onStatusChange?: (status: AgentSessionLifecycleStatus, sessionId?: string) => void;
  updateDatabaseStatus: (
    status: AgentSessionLifecycleStatus,
    sessionId?: string
  ) => Promise<void>;
  safeCloseSession: (reason: string) => void;
  scheduleReconnect: () => void;
  hooksFactory?: RuntimeControllerHooksFactory;
}

export class RuntimeController {
  private readonly deps: RuntimeControllerDeps;
  private readonly hooks: RuntimeControllerHooks;

  constructor(deps: RuntimeControllerDeps) {
    this.deps = deps;
    this.hooks = (deps.hooksFactory ?? createPassthroughAudioHooks)(this.createHookContext());
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

  async appendAudioChunk(chunk: RealtimeAudioChunk): Promise<void> {
    if (!chunk.audioBase64) {
      throw new Error('audioBase64 is required');
    }
    await this.hooks.appendAudioChunk(chunk);
  }

  async sendToolResult(callId: string, output: Record<string, unknown>): Promise<void> {
    if (!this.deps.isActive()) {
      this.log('warn', 'Skipping tool output - session inactive');
      return;
    }
    const session = this.deps.getSession();
    if (!session) {
      this.log('warn', 'Skipping tool output - session not available');
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
        this.log('warn', `Ignoring tool output for expired call_id ${callId}`);
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
    this.hooks.handleTransientError?.();
    this.deps.scheduleReconnect();
  }

  handleSessionClosed(reason: string): void {
    if (reason.includes('Transient error - reconnecting')) {
      return;
    }
    this.hooks.handleSessionClosed?.(reason);
  }

  markAudioReady(): void {
    this.hooks.markReady?.();
  }

  private log(
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: Parameters<NonNullable<RuntimeControllerDeps['onLog']>>[2]
  ): void {
    const timestamped = `[${new Date().toISOString()}] ${message}`;
    this.deps.onLog?.(level, timestamped, context);
  }

  private createHookContext(): RuntimeControllerHookContext {
    return {
      config: this.deps.config,
      getSession: this.deps.getSession,
      isActive: this.deps.isActive,
      messageQueue: this.deps.messageQueue,
      log: (level, message, context) => this.log(level, message, context),
    };
  }

  static computeFlushThreshold(format: AudioFormat): number {
    const bytesPerMillisecond = (format.sampleRate * format.bytesPerSample) / 1000;
    return Math.max(1, Math.ceil(bytesPerMillisecond * TARGET_CHUNK_DURATION_MS));
  }
}

export const createPassthroughAudioHooks: RuntimeControllerHooksFactory = (context) => ({
  appendAudioChunk: (chunk) => {
    const session = context.getSession();
    if (!context.isActive() || !session) {
      throw new Error('Session not connected');
    }

    session.send({
      type: 'input_audio_buffer.append',
      audio: chunk.audioBase64,
    } as RealtimeClientEvent);

    const appendedBytes = Math.round((chunk.audioBase64.length * 3) / 4);
    if (appendedBytes > 0) {
      context.messageQueue.incrementPendingAudio(appendedBytes);
    }

    if (!chunk.isFinal) {
      return;
    }

    if (context.messageQueue.hasPendingAudio()) {
      session.send({ type: 'input_audio_buffer.commit' } as RealtimeClientEvent);
      context.messageQueue.resetPendingAudio();
    } else {
      context.log('warn', 'Skipping audio commit: no buffered audio');
    }
  },
});

export const createBufferedTranscriptAudioHooks: RuntimeControllerHooksFactory = (context) => {
  let transcriptPcmBuffer: Buffer = Buffer.alloc(0);
  let transcriptQueue: Promise<void> = Promise.resolve();
  let audioFormat: AudioFormat = {
    sampleRate: DEFAULT_SAMPLE_RATE,
    bytesPerSample: DEFAULT_BYTES_PER_SAMPLE,
    encoding: DEFAULT_ENCODING,
  };
  let flushThresholdBytes = RuntimeController.computeFlushThreshold(audioFormat);
  let audioReady = false;

  const inferBytesPerSample = (encoding?: string): number | undefined => {
    switch (encoding) {
      case 'pcm_s8':
        return 1;
      case 'pcm_s16le':
      case 'pcm_s16be':
        return 2;
      case 'pcm_s24le':
      case 'pcm_s24be':
        return 3;
      case 'pcm_s32le':
      case 'pcm_s32be':
        return 4;
      case 'pcm_f32le':
      case 'pcm_f32be':
        return 4;
      case 'pcm_f64le':
      case 'pcm_f64be':
        return 8;
      default:
        return undefined;
    }
  };

  const resolveAudioFormat = (
    chunk: Pick<RealtimeAudioChunk, 'sampleRate' | 'bytesPerSample' | 'encoding'>,
    incomingLength: number
  ): { format: AudioFormat; formatChanged: boolean; previousFormat: AudioFormat } | null => {
    const previousFormat = audioFormat;
    const sampleRate =
      typeof chunk.sampleRate === 'number' && Number.isFinite(chunk.sampleRate) && chunk.sampleRate > 0
        ? chunk.sampleRate
        : previousFormat.sampleRate;

    const encoding =
      typeof chunk.encoding === 'string' && chunk.encoding.length > 0 ? chunk.encoding : previousFormat.encoding;

    const bytesFromChunk =
      typeof chunk.bytesPerSample === 'number' && Number.isFinite(chunk.bytesPerSample) && chunk.bytesPerSample > 0
        ? Math.trunc(chunk.bytesPerSample)
        : undefined;

    const inferredBytes = bytesFromChunk ?? inferBytesPerSample(chunk.encoding) ?? previousFormat.bytesPerSample;

    if (!Number.isFinite(inferredBytes) || inferredBytes <= 0) {
      context.log('warn', 'Invalid bytesPerSample detected, dropping transcript chunk');
      return null;
    }

    if (incomingLength > 0 && incomingLength % inferredBytes !== 0) {
      context.log('warn', `Transcript chunk length ${incomingLength} is not aligned to ${inferredBytes}-byte samples`);
      return null;
    }

    const format: AudioFormat = {
      sampleRate,
      bytesPerSample: inferredBytes,
      encoding,
    };

    const formatChanged =
      format.sampleRate !== previousFormat.sampleRate ||
      format.bytesPerSample !== previousFormat.bytesPerSample ||
      format.encoding !== previousFormat.encoding;

    return { format, formatChanged, previousFormat };
  };

  const flushTranscriptBuffer = (params: {
    session: OpenAIRealtimeWebSocket;
    format: AudioFormat;
    flushAll: boolean;
    minFlushBytes: number;
    logPrefix: string;
  }): void => {
    const { session, format, flushAll, minFlushBytes, logPrefix } = params;

    const flushChunk = (size: number): void => {
      const payload = transcriptPcmBuffer.subarray(0, size);
      const payloadBase64 = payload.toString('base64');

      try {
        context.log('log', `WS send -> input_audio_buffer.append (${payload.length} bytes)`);
        session.send({
          type: 'input_audio_buffer.append',
          audio: payloadBase64,
        } as RealtimeClientEvent);
      } catch (error: unknown) {
        context.log('warn', `${logPrefix}: failed to flush ${payload.length} bytes, preserving buffer for retry`);
        throw error;
      }

      transcriptPcmBuffer = transcriptPcmBuffer.subarray(size);

      const approxMs = (payload.length / (format.sampleRate * format.bytesPerSample)) * 1000;
      context.log('log', `${logPrefix}: flushed ${payload.length} bytes (~${approxMs.toFixed(2)} ms) to transcript session`);
    };

    while (transcriptPcmBuffer.length >= minFlushBytes) {
      flushChunk(minFlushBytes);
    }

    if (flushAll && transcriptPcmBuffer.length > 0) {
      const remaining = transcriptPcmBuffer.length;
      flushChunk(remaining);
    }
  };

  const handleTranscriptChunk = (chunk: RealtimeAudioChunk): void => {
    const session = context.getSession();
    const isActive = context.isActive();

    if (!session || !isActive) {
      const incoming = Buffer.from(chunk.audioBase64, 'base64');
      if (incoming.length > 0) {
        transcriptPcmBuffer = Buffer.concat([transcriptPcmBuffer, incoming]);
      }
      return;
    }

    const incoming = Buffer.from(chunk.audioBase64, 'base64');
    const formatResolution = resolveAudioFormat(chunk, incoming.length);

    if (!formatResolution) {
      return;
    }

    const { format, formatChanged, previousFormat } = formatResolution;

    if (formatChanged && transcriptPcmBuffer.length > 0) {
      flushTranscriptBuffer({
        session,
        format: previousFormat,
        flushAll: true,
        minFlushBytes: RuntimeController.computeFlushThreshold(previousFormat),
        logPrefix: 'Format change flush',
      });
    }

    audioFormat = format;
    flushThresholdBytes = RuntimeController.computeFlushThreshold(format);

    if (incoming.length > 0) {
      transcriptPcmBuffer = Buffer.concat([transcriptPcmBuffer, incoming]);
    }

    if (!chunk.isFinal) {
      if (!audioReady) {
        context.log('log', 'Transcript audio buffered while session not ready');
        return;
      }
      flushTranscriptBuffer({
        session,
        format,
        flushAll: false,
        minFlushBytes: flushThresholdBytes,
        logPrefix: 'Buffered flush',
      });
      return;
    }

    if (!audioReady) {
      context.log('warn', 'Skipping final flush: transcript session not ready');
      return;
    }

    flushTranscriptBuffer({
      session,
      format,
      flushAll: true,
      minFlushBytes: flushThresholdBytes,
      logPrefix: 'Final flush',
    });
  };

  return {
    appendAudioChunk: async (chunk) => {
      transcriptQueue = transcriptQueue
        .catch(() => undefined)
        .then(() => {
          handleTranscriptChunk(chunk);
        });

      await transcriptQueue;
    },
    handleSessionClosed: (reason) => {
      audioReady = false;
      if (transcriptPcmBuffer.length > 0) {
        context.log(
          'log',
          `Clearing ${transcriptPcmBuffer.length} buffered transcript byte(s) after session close (${reason})`
        );
        transcriptPcmBuffer = Buffer.alloc(0);
      }
    },
    handleTransientError: () => {
      if (transcriptPcmBuffer.length > 0) {
        context.log(
          'log',
          `Preserving ${transcriptPcmBuffer.length} buffered transcript bytes during reconnect`
        );
      }
      audioReady = false;
    },
    markReady: () => {
      if (audioReady) {
        return;
      }

      audioReady = true;
      context.log('log', 'Transcript session marked ready for audio');

      const session = context.getSession();
      if (!session || !context.isActive()) {
        return;
      }

      if (transcriptPcmBuffer.length === 0) {
        return;
      }

      flushTranscriptBuffer({
        session,
        format: audioFormat,
        flushAll: true,
        minFlushBytes: flushThresholdBytes,
        logPrefix: 'Ready flush',
      });
    },
  };
};

