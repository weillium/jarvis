import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeClientEvent } from 'openai/resources/realtime/realtime';
import type { RealtimeMessageContext, RealtimeSessionConfig } from './types';
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
  private transcriptQueue: Promise<void> = Promise.resolve();
  private audioFormat: AudioFormat = {
    sampleRate: DEFAULT_SAMPLE_RATE,
    bytesPerSample: DEFAULT_BYTES_PER_SAMPLE,
    encoding: DEFAULT_ENCODING,
  };
  private flushThresholdBytes: number = RuntimeController.computeFlushThreshold({
    sampleRate: DEFAULT_SAMPLE_RATE,
    bytesPerSample: DEFAULT_BYTES_PER_SAMPLE,
    encoding: DEFAULT_ENCODING,
  });
  private audioReady: boolean;

  constructor(deps: RuntimeControllerDeps) {
    this.deps = deps;
    this.audioReady = deps.config.agentType !== 'transcript';
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
    bytesPerSample?: number;
    encoding?: string;
    durationMs?: number;
    speaker?: string;
  }): Promise<void> {
    if (!chunk.audioBase64) {
      throw new Error('audioBase64 is required');
    }

    const isTranscriptAgent = this.deps.config.agentType === 'transcript';

    if (!isTranscriptAgent) {
      this.processNonTranscriptChunk(chunk);
      return;
    }

    this.transcriptQueue = this.transcriptQueue
      .catch(() => undefined)
      .then(() => this.processTranscriptChunk(chunk));

    await this.transcriptQueue;
  }

  private processNonTranscriptChunk(chunk: {
    audioBase64: string;
    isFinal?: boolean;
  }): void {
    const session = this.deps.getSession();
    if (!this.deps.isActive() || !session) {
      throw new Error('Session not connected');
    }

    session.send({
      type: 'input_audio_buffer.append',
      audio: chunk.audioBase64,
    } as RealtimeClientEvent);

    const appendedBytes = Math.round((chunk.audioBase64.length * 3) / 4);
    if (appendedBytes > 0) {
      this.deps.messageQueue.incrementPendingAudio(appendedBytes);
    }

    if (!chunk.isFinal) {
      return;
    }

    if (this.deps.messageQueue.hasPendingAudio()) {
      session.send({ type: 'input_audio_buffer.commit' } as RealtimeClientEvent);
      this.deps.messageQueue.resetPendingAudio();
    } else {
      this.log('warn', 'Skipping audio commit: no buffered audio');
    }
  }

  private processTranscriptChunk(chunk: {
    audioBase64: string;
    isFinal?: boolean;
    sampleRate?: number;
    bytesPerSample?: number;
    encoding?: string;
  }): void {
    const session = this.deps.getSession();
    const isActive = this.deps.isActive();

    if (!session || !isActive) {
      const incoming = Buffer.from(chunk.audioBase64, 'base64');
      if (incoming.length > 0) {
        this.transcriptPcmBuffer = Buffer.concat([this.transcriptPcmBuffer, incoming]);
      }
      return;
    }

    const incoming = Buffer.from(chunk.audioBase64, 'base64');
    const formatResolution = this.resolveAudioFormat(chunk, incoming.length);

    if (!formatResolution) {
      return;
    }

    const { format, formatChanged, previousFormat } = formatResolution;

    if (formatChanged && this.transcriptPcmBuffer.length > 0) {
      this.flushTranscriptBuffer({
        session,
        format: previousFormat,
        flushAll: true,
        minFlushBytes: RuntimeController.computeFlushThreshold(previousFormat),
        logPrefix: 'Format change flush',
      });
    }

    this.audioFormat = format;
    this.flushThresholdBytes = RuntimeController.computeFlushThreshold(format);

    if (incoming.length > 0) {
      this.transcriptPcmBuffer = Buffer.concat([this.transcriptPcmBuffer, incoming]);
    }

    if (!chunk.isFinal) {
      if (!this.audioReady) {
        this.log('log', 'Transcript audio buffered while session not ready');
        return;
      }
      this.flushTranscriptBuffer({
        session,
        format,
        flushAll: false,
        minFlushBytes: this.flushThresholdBytes,
        logPrefix: 'Buffered flush',
      });
      return;
    }

    if (!this.audioReady) {
      this.log('warn', 'Skipping final flush: transcript session not ready');
      return;
    }

    this.flushTranscriptBuffer({
      session,
      format,
      flushAll: true,
      minFlushBytes: this.flushThresholdBytes,
      logPrefix: 'Final flush',
    });
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
    if (this.transcriptPcmBuffer.length > 0) {
      this.log('log', `Preserving ${this.transcriptPcmBuffer.length} buffered transcript bytes during reconnect`);
    }
    if (this.deps.config.agentType === 'transcript') {
      this.audioReady = false;
    }
    this.deps.scheduleReconnect();
  }

  handleSessionClosed(reason: string): void {
    if (reason.includes('Transient error - reconnecting')) {
      return;
    }

    if (this.deps.config.agentType === 'transcript') {
      this.audioReady = false;
    }

    if (this.transcriptPcmBuffer.length > 0) {
      this.log(
        'log',
        `Clearing ${this.transcriptPcmBuffer.length} buffered transcript byte(s) after session close (${reason})`
      );
      this.transcriptPcmBuffer = Buffer.alloc(0);
    }
  }

  markTranscriptReady(): void {
    if (this.deps.config.agentType !== 'transcript') {
      return;
    }
    if (this.audioReady) {
      return;
    }

    this.audioReady = true;
    this.log('log', 'Transcript session marked ready for audio');

    const session = this.deps.getSession();
    if (!session || !this.deps.isActive()) {
      return;
    }

    if (this.transcriptPcmBuffer.length === 0) {
      return;
    }

    this.flushTranscriptBuffer({
      session,
      format: this.audioFormat,
      flushAll: true,
      minFlushBytes: this.flushThresholdBytes,
      logPrefix: 'Ready flush',
    });
  }

  private log(
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: Parameters<NonNullable<RuntimeControllerDeps['onLog']>>[2]
  ): void {
    const timestamped = `[${new Date().toISOString()}] ${message}`;
    this.deps.onLog?.(level, timestamped, context);
  }

  private static computeFlushThreshold(format: AudioFormat): number {
    const bytesPerMillisecond = (format.sampleRate * format.bytesPerSample) / 1000;
    return Math.max(1, Math.ceil(bytesPerMillisecond * TARGET_CHUNK_DURATION_MS));
  }

  private resolveAudioFormat(
    chunk: { sampleRate?: number; bytesPerSample?: number; encoding?: string },
    incomingLength: number
  ): { format: AudioFormat; formatChanged: boolean; previousFormat: AudioFormat } | null {
    const previousFormat = this.audioFormat;
    const sampleRate =
      typeof chunk.sampleRate === 'number' && Number.isFinite(chunk.sampleRate) && chunk.sampleRate > 0
        ? chunk.sampleRate
        : previousFormat.sampleRate;

    const encoding = typeof chunk.encoding === 'string' && chunk.encoding.length > 0
      ? chunk.encoding
      : previousFormat.encoding;

    const bytesFromChunk =
      typeof chunk.bytesPerSample === 'number' && Number.isFinite(chunk.bytesPerSample) && chunk.bytesPerSample > 0
        ? Math.trunc(chunk.bytesPerSample)
        : undefined;

    const inferredBytes = bytesFromChunk ?? this.inferBytesPerSample(chunk.encoding) ?? previousFormat.bytesPerSample;

    if (!Number.isFinite(inferredBytes) || inferredBytes <= 0) {
      this.log('warn', 'Invalid bytesPerSample detected, dropping transcript chunk');
      return null;
    }

    if (incomingLength > 0 && incomingLength % inferredBytes !== 0) {
      this.log('warn', `Transcript chunk length ${incomingLength} is not aligned to ${inferredBytes}-byte samples`);
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
  }

  private inferBytesPerSample(encoding?: string): number | undefined {
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
  }

  private flushTranscriptBuffer(params: {
    session: OpenAIRealtimeWebSocket;
    format: AudioFormat;
    flushAll: boolean;
    minFlushBytes: number;
    logPrefix: string;
  }): void {
    const { session, format, flushAll, minFlushBytes, logPrefix } = params;

    const flushChunk = (size: number): void => {
      const payload = this.transcriptPcmBuffer.subarray(0, size);
      const payloadBase64 = payload.toString('base64');

      try {
        this.log('log', `WS send -> input_audio_buffer.append (${payload.length} bytes)`);
        session.send({
          type: 'input_audio_buffer.append',
          audio: payloadBase64,
        } as RealtimeClientEvent);
      } catch (error: unknown) {
        this.log('warn', `${logPrefix}: failed to flush ${payload.length} bytes, preserving buffer for retry`);
        throw error;
      }

      this.transcriptPcmBuffer = this.transcriptPcmBuffer.subarray(size);

      const approxMs = (payload.length / (format.sampleRate * format.bytesPerSample)) * 1000;
      this.log('log', `${logPrefix}: flushed ${payload.length} bytes (~${approxMs.toFixed(2)} ms) to transcript session`);
    };

    while (this.transcriptPcmBuffer.length >= minFlushBytes) {
      flushChunk(minFlushBytes);
    }

    if (flushAll && this.transcriptPcmBuffer.length > 0) {
      const remaining = this.transcriptPcmBuffer.length;
      flushChunk(remaining);
    }
  }
}

