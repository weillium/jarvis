import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { AgentSessionLifecycleStatus, AgentType } from './types';
import {
  getLowercaseErrorField,
  extractErrorMessage,
} from './payload-utils';
import { getUnderlyingSocket } from './transport-utils';

type LogLevel = 'log' | 'warn' | 'error';

type LogFn = (level: LogLevel, message: string, context?: { seq?: number }) => void;

type NotifyStatusFn = (
  status: AgentSessionLifecycleStatus,
  sessionId?: string
) => void;

type UpdateDatabaseStatusFn = (
  status: AgentSessionLifecycleStatus,
  sessionId?: string
) => Promise<void>;

type EmitErrorFn = (error: Error) => void;

interface HeartbeatManagerOptions {
  agentType: AgentType;
  eventId: string;
  getSession: () => OpenAIRealtimeWebSocket | undefined;
  isActive: () => boolean;
  setActive: (active: boolean) => void;
  log?: LogFn;
  notifyStatus?: NotifyStatusFn;
  updateDatabaseStatus?: UpdateDatabaseStatusFn;
  emitError: EmitErrorFn;
}

interface HeartbeatTimings {
  pingIntervalMs: number;
  pongTimeoutMs: number;
  maxMissedPongs: number;
}

export interface HeartbeatState {
  enabled: boolean;
  missedPongs: number;
  lastPongReceived?: Date;
  pingIntervalMs: number;
  pongTimeoutMs: number;
  maxMissedPongs: number;
}

export class HeartbeatManager {
  private pingInterval?: NodeJS.Timeout;
  private pongTimeout?: NodeJS.Timeout;
  private missedPongs = 0;
  private lastPongReceived?: Date;
  private pingStartTime?: number;

  constructor(
    private readonly options: HeartbeatManagerOptions,
    private readonly timings: HeartbeatTimings
  ) {}

  start(): void {
    this.stop();
    this.missedPongs = 0;
    this.lastPongReceived = new Date();

    this.pingInterval = setInterval(() => {
      void this.sendPing();
    }, this.timings.pingIntervalMs);

    console.log(
      `[realtime] Ping-pong heartbeat started (interval: ${this.timings.pingIntervalMs}ms, timeout: ${this.timings.pongTimeoutMs}ms) for ${this.options.agentType}`
    );
  }

  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }
  }

  handlePong(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = undefined;
    }

    const pongLatency = this.pingStartTime ? Date.now() - this.pingStartTime : undefined;
    this.lastPongReceived = new Date();
    this.missedPongs = 0;

    if (pongLatency !== undefined && Math.random() < 0.2) {
      console.log(`[realtime] [${this.options.agentType}] Pong received`, {
        latency: `${pongLatency}ms`,
        missedPongsReset: true,
        eventId: this.options.eventId,
      });
      this.options.log?.('log', `Pong received (latency: ${pongLatency}ms)`);
    }
  }

  handlePongTimeout(): void {
    this.missedPongs += 1;

    console.warn(
      `[realtime] Pong timeout (${this.options.agentType}) - missed: ${this.missedPongs}/${this.timings.maxMissedPongs}`
    );
    this.options.log?.(
      'warn',
      `Ping-pong timeout - missed ${this.missedPongs}/${this.timings.maxMissedPongs} pongs`
    );

    if (this.missedPongs >= this.timings.maxMissedPongs) {
      console.error(
        `[realtime] Connection dead - ${this.missedPongs} missed pongs (${this.options.agentType})`
      );
      this.options.log?.('error', `Connection dead - ${this.missedPongs} missed pongs`);

      this.options.setActive(false);
      this.options.notifyStatus?.('error');
      if (this.options.updateDatabaseStatus) {
        void this.options.updateDatabaseStatus('error');
      }

      this.stop();
      this.options.emitError(
        new Error(`Connection dead - ${this.missedPongs} missed pongs`)
      );
    }
  }

  getState(): HeartbeatState {
    return {
      enabled: this.pingInterval !== undefined,
      missedPongs: this.missedPongs,
      lastPongReceived: this.lastPongReceived,
      pingIntervalMs: this.timings.pingIntervalMs,
      pongTimeoutMs: this.timings.pongTimeoutMs,
      maxMissedPongs: this.timings.maxMissedPongs,
    };
  }

  private sendPing(): void {
    if (!this.options.isActive()) {
      return;
    }

    const session = this.options.getSession();
    if (!session) {
      this.handlePongTimeout();
      return;
    }

    this.pingStartTime = Date.now();

    const shouldLog = this.missedPongs === 0 && Math.random() < 0.2;
    if (shouldLog) {
      console.log(`[realtime] [${this.options.agentType}] Sending ping`, {
        missedPongs: this.missedPongs,
        lastPongReceived: this.lastPongReceived?.toISOString(),
        eventId: this.options.eventId,
        timestamp: new Date().toISOString(),
      });
      this.options.log?.('log', 'Ping sent (health check)');
    }

    try {
      const underlyingSocket = getUnderlyingSocket(session);
      if (underlyingSocket && underlyingSocket.readyState === 1 && typeof underlyingSocket.ping === 'function') {
        underlyingSocket.ping();
        this.pongTimeout = setTimeout(() => {
          this.handlePongTimeout();
        }, this.timings.pongTimeoutMs);
        return;
      }

      if (underlyingSocket && typeof underlyingSocket.ping !== 'function') {
        this.stop();
        return;
      }

      console.warn(`[realtime] [${this.options.agentType}] Cannot send ping - socket not available`, {
        readyState: underlyingSocket?.readyState,
        hasSocket: !!underlyingSocket,
        eventId: this.options.eventId,
      });
      this.handlePongTimeout();
    } catch (error: unknown) {
      const message = getLowercaseErrorField(error, 'message');
      if (message.includes('ping is not a function') || message.includes('underlyingsocket')) {
        console.log(`[realtime] Ping/pong not supported - disabling (${this.options.agentType})`);
        this.stop();
        return;
      }
      console.error(`[realtime] Error sending ping: ${extractErrorMessage(error)}`);
      this.handlePongTimeout();
    }
  }
}

