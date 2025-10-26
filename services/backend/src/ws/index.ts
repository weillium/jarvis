import type { Server, Socket } from 'socket.io';
import pino from 'pino';
import { createOrchestrator } from '../orchestrator';
import { config } from '../config';

const log = pino({ name: 'ws' });

export function initWs(io: Server) {
  const orchestrator = createOrchestrator(io);

  const transcriptNamespace = io.of('/ws/transcript');
  transcriptNamespace.use((socket, next) => {
    const jwt = extractJwt(socket);
    if (!jwt) {
      log.warn({ id: socket.id }, 'rejecting transcript connection without jwt');
      const err = new Error('unauthorized');
      (err as any).data = { code: 4401 };
      return next(err);
    }
    return next();
  });

  transcriptNamespace.on('connection', (socket) => {
    log.info({ id: socket.id }, 'transcript ws connected');
    setupHeartbeat(socket);
    socket.on('message', async (payload: string) => {
      try {
        const frame = JSON.parse(payload);
        await orchestrator.onTranscriptFrame(frame, socket);
      } catch (err) {
        log.warn({ err }, 'failed to process transcript frame');
      }
    });
  });

  const cardsNamespace = io.of('/ws/cards');
  cardsNamespace.on('connection', (socket) => {
    log.info({ id: socket.id }, 'cards ws connected');
    setupHeartbeat(socket);
  });
}

function extractJwt(socket: Socket): string | undefined {
  const queryJwt = typeof socket.handshake.query.jwt === 'string' ? socket.handshake.query.jwt : undefined;
  const headerJwt = typeof socket.handshake.headers?.authorization === 'string'
    ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
    : undefined;
  const authJwt = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;
  return queryJwt || headerJwt || authJwt;
}

function setupHeartbeat(socket: Socket) {
  let lastPong = Date.now();
  const interval = setInterval(() => {
    const elapsed = Date.now() - lastPong;
    if (elapsed > config.wsHeartbeatMs * config.wsMissedHeartbeatsBeforeClose) {
      log.warn({ id: socket.id }, 'closing socket due to missed heartbeats');
      clearInterval(interval);
      socket.disconnect(true);
    }
  }, config.wsHeartbeatMs);

  socket.conn.on('packet', (packet: any) => {
    if (packet.type === 'pong') {
      lastPong = Date.now();
    }
  });

  socket.on('disconnect', () => {
    clearInterval(interval);
  });
}
