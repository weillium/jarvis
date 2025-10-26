import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import pino from 'pino';
import { config } from './config';
import { registerRoutes } from './routes';
import { initWs } from './ws';
import { initMetricsRoute } from './services/metrics';
import { preloadDefaultBundle } from './services/bundle';

const log = pino({ name: 'server' });

const app = express();
app.use(express.json());
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

initMetricsRoute(app);
registerRoutes(app);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    credentials: true
  }
});

initWs(io);
preloadDefaultBundle();

const PORT = config.port;
server.listen(PORT, () => log.info({ msg: 'backend up', PORT }));
