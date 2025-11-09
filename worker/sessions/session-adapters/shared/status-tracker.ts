import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeSessionStatus } from '../types';
import { getSessionInternals } from '../realtime/transport-utils';

export interface StatusTrackerContext {
  session?: OpenAIRealtimeWebSocket;
  isActive: boolean;
  getQueueLength: () => number;
  pingState: {
    enabled: boolean;
    missedPongs: number;
    lastPongReceived?: Date;
    pingIntervalMs: number;
    pongTimeoutMs: number;
    maxMissedPongs: number;
  };
}

const READY_STATE_LABELS: Array<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'> = [
  'CONNECTING',
  'OPEN',
  'CLOSING',
  'CLOSED',
];

export const buildStatusSnapshot = (context: StatusTrackerContext): RealtimeSessionStatus => {
  let websocketState: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' | undefined;
  let connectionUrl: string | undefined;
  let sessionId: string | undefined;
  let connectedAt: string | undefined;

  const { session } = context;

  if (session) {
    try {
      if ('url' in session && typeof session.url?.toString === 'function') {
        connectionUrl = session.url.toString();
        const parts = connectionUrl.split('/');
        sessionId = parts[parts.length - 1] || undefined;
      }

      const { socket } = getSessionInternals(session);
      if (socket && typeof socket.readyState === 'number') {
        websocketState = READY_STATE_LABELS[socket.readyState] ?? undefined;
        if (socket.readyState === 1 && socket.__connectedAt) {
          connectedAt = socket.__connectedAt;
        }
      }
    } catch {
      websocketState = context.isActive ? 'OPEN' : 'CLOSED';
    }
  } else {
    websocketState = 'CLOSED';
  }

  return {
    isActive: context.isActive,
    queueLength: context.getQueueLength(),
    websocketState,
    connectionUrl,
    sessionId,
    connectedAt,
    pingPong: {
      enabled: context.pingState.enabled,
      missedPongs: context.pingState.missedPongs,
      lastPongReceived: context.pingState.lastPongReceived?.toISOString(),
      pingIntervalMs: context.pingState.pingIntervalMs,
      pongTimeoutMs: context.pingState.pongTimeoutMs,
      maxMissedPongs: context.pingState.maxMissedPongs,
    },
  };
};

