import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import { isRecord } from './payload-utils';

interface SocketLike {
  readyState?: number;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  addEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  OPEN?: number;
  __connectedAt?: string;
  ping?: () => void;
}

interface TransportLike {
  state?: string;
  readyState?: string | number;
  addEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeEventListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

const isSocketLike = (value: unknown): value is SocketLike =>
  isRecord(value) &&
  (typeof (value as { readyState?: number }).readyState === 'number' ||
    typeof (value as { on?: unknown }).on === 'function' ||
    typeof (value as { addEventListener?: unknown }).addEventListener === 'function' ||
    typeof (value as { ping?: unknown }).ping === 'function');

const isTransportLike = (value: unknown): value is TransportLike =>
  isRecord(value) &&
  (typeof (value as { state?: unknown }).state === 'string' ||
    typeof (value as { readyState?: unknown }).readyState === 'string' ||
    typeof (value as { readyState?: unknown }).readyState === 'number');

export interface SessionInternals {
  transport?: TransportLike;
  socket?: SocketLike;
}

export const getSessionInternals = (
  session: OpenAIRealtimeWebSocket | undefined
): SessionInternals => {
  if (!session) {
    return {};
  }

  const candidate = session as unknown;
  if (!isRecord(candidate)) {
    return {};
  }

  const transport = isTransportLike((candidate as { transport?: unknown }).transport)
    ? ((candidate as { transport?: TransportLike }).transport)
    : undefined;
  const socketCandidate = (candidate as { socket?: unknown; ws?: unknown });

  const socket = isSocketLike(socketCandidate.socket)
    ? socketCandidate.socket
    : isSocketLike(socketCandidate.ws)
    ? socketCandidate.ws
    : undefined;

  return {
    transport,
    socket,
  };
};

export const getUnderlyingSocket = (
  session: OpenAIRealtimeWebSocket | undefined
): SocketLike | undefined => getSessionInternals(session).socket;

