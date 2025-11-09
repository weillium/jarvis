import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type OpenAI from 'openai';
import { extractErrorMessage, isRecord } from '../shared/payload-utils';
import { getSessionInternals } from './transport-utils';

export interface ConnectionManagerOptions {
  openai: OpenAI;
  onLog?: (level: 'log' | 'warn' | 'error', message: string) => void;
}

export class ConnectionManager {
  private readonly openai: OpenAI;
  private readonly onLog?: ConnectionManagerOptions['onLog'];

  constructor(options: ConnectionManagerOptions) {
    this.openai = options.openai;
    this.onLog = options.onLog;
  }

  async createSession(model: string, intent?: 'transcription'): Promise<{
    session: OpenAIRealtimeWebSocket;
    durationMs: number;
  }> {
    const start = Date.now();
    const websocketOptions: {
      model: string;
      dangerouslyAllowBrowser: boolean;
      onURL?: (url: URL) => void;
    } = {
      model,
      dangerouslyAllowBrowser: false,
    };

    if (intent) {
      websocketOptions.onURL = (url: URL) => {
        url.searchParams.set('intent', intent);
        url.searchParams.delete('model');
      };
    }

    const session = await OpenAIRealtimeWebSocket.create(this.openai, websocketOptions);
    const durationMs = Date.now() - start;
    return { session, durationMs };
  }

  async waitForTransportReady(
    session: OpenAIRealtimeWebSocket,
    timeoutMs: number = 5000
  ): Promise<number> {
    const start = Date.now();
    const { transport, socket } = getSessionInternals(session);

    const isOpen = (): boolean => {
      if (transport?.state) {
        return transport.state === 'open';
      }
      if (typeof transport?.readyState === 'string') {
        return transport.readyState.toLowerCase() === 'open';
      }
      if (typeof transport?.readyState === 'number') {
        return transport.readyState === 1;
      }
      if (socket?.readyState !== undefined) {
        const openConst = socket.OPEN ?? 1;
        return socket.readyState === openConst;
      }
      return false;
    };

    if (isOpen()) {
      this.onLog?.('log', 'Realtime transport already open');
      return 0;
    }

    this.onLog?.('log', 'Waiting for realtime transport to open');

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let pollInterval: NodeJS.Timeout | null = null;
      const removeListeners: Array<() => void> = [];

      const cleanup = () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        removeListeners.forEach((remove) => {
          try {
            remove();
          } catch (err: unknown) {
            const message = extractErrorMessage(err);
            console.warn('[realtime] Failed to remove transport listener', message);
          }
        });
        removeListeners.length = 0;
      };

      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const timeoutId = setTimeout(() => {
        rejectOnce(new Error('Timed out waiting for realtime transport to open'));
      }, timeoutMs);

      removeListeners.push(() => clearTimeout(timeoutId));

      if (transport && typeof transport.addEventListener === 'function') {
        const handleTransportOpen = () => resolveOnce();
        const handleTransportError = (event: unknown) => {
          if (isOpen()) {
            resolveOnce();
            return;
          }
          const transportError =
            isRecord(event) && event.error instanceof Error
              ? event.error
              : new Error('Transport error before open');
          rejectOnce(transportError);
        };
        transport.addEventListener('open', handleTransportOpen);
        transport.addEventListener('error', handleTransportError);
        removeListeners.push(() => {
          if (typeof transport.removeEventListener === 'function') {
            transport.removeEventListener('open', handleTransportOpen);
            transport.removeEventListener('error', handleTransportError);
          }
        });
      }

      if (socket) {
        if (typeof socket.on === 'function') {
          const handleSocketOpen = () => resolveOnce();
          const handleSocketError = (err: unknown) => {
            if (isOpen()) {
              resolveOnce();
              return;
            }
            rejectOnce(err instanceof Error ? err : new Error(extractErrorMessage(err)));
          };
          socket.on('open', handleSocketOpen);
          socket.on('error', handleSocketError);
          removeListeners.push(() => {
            if (typeof socket.off === 'function') {
              socket.off('open', handleSocketOpen);
              socket.off('error', handleSocketError);
            } else if (typeof socket.removeListener === 'function') {
              socket.removeListener('open', handleSocketOpen);
              socket.removeListener('error', handleSocketError);
            }
          });
        } else if (typeof socket.addEventListener === 'function') {
          const handleSocketOpen = () => resolveOnce();
          const handleSocketError = (event: unknown) => {
            if (isOpen()) {
              resolveOnce();
              return;
            }
            const socketError =
              isRecord(event) && event.error instanceof Error
                ? event.error
                : new Error('WebSocket error before open');
            rejectOnce(socketError);
          };
          socket.addEventListener('open', handleSocketOpen);
          socket.addEventListener('error', handleSocketError);
          removeListeners.push(() => {
            if (typeof socket.removeEventListener === 'function') {
              socket.removeEventListener('open', handleSocketOpen);
              socket.removeEventListener('error', handleSocketError);
            }
          });
        }
      }

      pollInterval = setInterval(() => {
        if (isOpen()) {
          resolveOnce();
        }
      }, 50);
    });

    const elapsed = Date.now() - start;
    this.onLog?.('log', `Realtime transport opened after ${elapsed}ms`);
    return elapsed;
  }
}

