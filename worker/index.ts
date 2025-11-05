import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Orchestrator, OrchestratorConfig } from './core/orchestrator';
import { BlueprintPoller } from './polling/blueprint-poller';
import { ContextPoller } from './polling/context-poller';
import { RegenerationPoller } from './polling/regeneration-poller';
import { PauseResumePoller } from './polling/pause-resume-poller';
import { SessionStartupPoller } from './polling/session-startup-poller';
import http from 'http';
import { URL } from 'url';

/** ---------- env ---------- **/
function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
const SUPABASE_URL  = need('SUPABASE_URL');
const SERVICE_ROLE  = need('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_KEY    = need('OPENAI_API_KEY');
const EMBED_MODEL   = process.env.EMBED_MODEL || 'text-embedding-3-small';
const GEN_MODEL     = process.env.GEN_MODEL   || 'gpt-5';
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
const EXA_API_KEY   = process.env.EXA_API_KEY; // Optional - fallback to stub if not provided
// Clean SSE_ENDPOINT - remove backticks and other invalid characters
const SSE_ENDPOINT_RAW = process.env.SSE_ENDPOINT || 'http://localhost:3000';
const SSE_ENDPOINT = SSE_ENDPOINT_RAW.trim().replace(/[`'"]/g, ''); // Base URL for SSE push endpoint

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const openai   = new OpenAI({ apiKey: OPENAI_KEY });

/** ---------- helpers ---------- **/
function log(...a: any[]) { console.log(new Date().toISOString(), ...a); }

/** ---------- orchestrator ---------- **/
const orchestratorConfig: OrchestratorConfig = {
  supabase: supabase as any as ReturnType<typeof createClient>,
  openai,
  embedModel: EMBED_MODEL,
  genModel: GEN_MODEL,
  realtimeModel: REALTIME_MODEL,
  sseEndpoint: SSE_ENDPOINT,
};

const orchestrator = new Orchestrator(orchestratorConfig);

// Track agents currently being processed to prevent duplicate processing across pollers
const processingAgents = new Set<string>();

/** ---------- poller instances ---------- **/
const blueprintPoller = new BlueprintPoller(
  supabase,
  openai,
  GEN_MODEL,
  processingAgents,
  log
);

const contextPoller = new ContextPoller(
  supabase,
  openai,
  EMBED_MODEL,
  GEN_MODEL,
  EXA_API_KEY,
  processingAgents,
  log
);

const regenerationPoller = new RegenerationPoller(
  supabase,
  openai,
  EMBED_MODEL,
  GEN_MODEL,
  EXA_API_KEY,
  processingAgents,
  log
);

const pauseResumePoller = new PauseResumePoller(supabase, orchestrator, log);
const sessionStartupPoller = new SessionStartupPoller(supabase, orchestrator, log);

/** ---------- HTTP server for direct worker queries ---------- **/
function createWorkerServer() {
  const WORKER_PORT = parseInt(process.env.WORKER_PORT || '3001', 10);
  
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      // Health check endpoint
      if (pathname === '/health' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, status: 'healthy' }));
        return;
      }

      // WebSocket state endpoint: GET /websocket-state?event_id=<eventId>
      if (pathname === '/websocket-state' && req.method === 'GET') {
        const eventId = url.searchParams.get('event_id');
        
        if (!eventId) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'Missing event_id parameter' }));
          return;
        }

        // Get runtime from orchestrator
        const runtime = orchestrator.getRuntime(eventId);
        
        if (!runtime) {
          res.writeHead(200);
          res.end(JSON.stringify({
            ok: true,
            event_id: eventId,
            runtime_exists: false,
            sessions: [],
          }));
          return;
        }

        // Get WebSocket state from both sessions
        const sessions = [];
        
        if (runtime.cardsSession) {
          const cardsStatus = runtime.cardsSession.getStatus();
          sessions.push({
            agent_type: 'cards',
            websocket_state: cardsStatus.websocketState || (cardsStatus.isActive ? 'OPEN' : 'CLOSED'),
            is_active: cardsStatus.isActive,
            queue_length: cardsStatus.queueLength,
            session_id: cardsStatus.sessionId || runtime.cardsSessionId,
            connection_url: cardsStatus.connectionUrl || 'Not available',
            connected_at: cardsStatus.connectedAt || null,
            connection_info: {
              provider: 'OpenAI Realtime API',
              endpoint: cardsStatus.connectionUrl ? new URL(cardsStatus.connectionUrl).origin : 'Unknown',
              path: cardsStatus.connectionUrl ? new URL(cardsStatus.connectionUrl).pathname : 'Unknown',
            },
            ping_pong: cardsStatus.pingPong,
          });
        }

        if (runtime.factsSession) {
          const factsStatus = runtime.factsSession.getStatus();
          sessions.push({
            agent_type: 'facts',
            websocket_state: factsStatus.websocketState || (factsStatus.isActive ? 'OPEN' : 'CLOSED'),
            is_active: factsStatus.isActive,
            queue_length: factsStatus.queueLength,
            session_id: factsStatus.sessionId || runtime.factsSessionId,
            connection_url: factsStatus.connectionUrl || 'Not available',
            connected_at: factsStatus.connectedAt || null,
            connection_info: {
              provider: 'OpenAI Realtime API',
              endpoint: factsStatus.connectionUrl ? new URL(factsStatus.connectionUrl).origin : 'Unknown',
              path: factsStatus.connectionUrl ? new URL(factsStatus.connectionUrl).pathname : 'Unknown',
            },
            ping_pong: factsStatus.pingPong,
          });
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          ok: true,
          event_id: eventId,
          runtime_exists: true,
          runtime_status: runtime.status,
          sessions,
        }));
        return;
      }

      // 404 for unknown routes
      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    } catch (error: any) {
      log('[worker-server] Error:', error.message);
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: error.message || 'Internal server error' }));
    }
  });

  server.listen(WORKER_PORT, () => {
    log(`[worker-server] HTTP server listening on port ${WORKER_PORT}`);
    log(`[worker-server] Endpoints:`);
    log(`[worker-server]   GET /health - Health check`);
    log(`[worker-server]   GET /websocket-state?event_id=<eventId> - Get WebSocket connection state`);
  });

  return server;
}

/** ---------- main ---------- **/
async function main() {
  log('Worker/Orchestrator starting...');
  
  try {
    // Initialize orchestrator (subscribes to Realtime, resumes events)
    await orchestrator.initialize();
    
    // Start HTTP server for direct worker queries
    const workerServer = createWorkerServer();
    
    // Start polling loops for blueprint generation, context generation, pause/resume, and run
    // Note: These are fallbacks for agents that need blueprint/execution or events that need to start
    // The main processing happens via Realtime subscriptions (event-driven)
    setInterval(() => {
      blueprintPoller.tick().catch((err) => log('[poller:blueprint] error', err?.message || err));
    }, blueprintPoller.getInterval());

    setInterval(() => {
      contextPoller.tick().catch((err) => log('[poller:context] error', err?.message || err));
    }, contextPoller.getInterval());

    setInterval(() => {
      regenerationPoller.tick().catch((err) => log('[poller:regeneration] error', err?.message || err));
    }, regenerationPoller.getInterval());

    setInterval(() => {
      pauseResumePoller.tick().catch((err) => log('[poller:pause-resume] error', err?.message || err));
    }, pauseResumePoller.getInterval());

    setInterval(() => {
      sessionStartupPoller.tick().catch((err) => log('[poller:session-start] error', err?.message || err));
    }, sessionStartupPoller.getInterval());
    // tickRun is disabled - manual session management via API
    
    log('Worker/Orchestrator running...');
    
    // Graceful shutdown for HTTP server
    process.on('SIGTERM', async () => {
      log('[shutdown] SIGTERM received');
      workerServer.close(() => {
        log('[worker-server] HTTP server closed');
      });
      await orchestrator.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      log('[shutdown] SIGINT received');
      workerServer.close(() => {
        log('[worker-server] HTTP server closed');
      });
      await orchestrator.shutdown();
      process.exit(0);
    });
  } catch (e: any) {
    log('[fatal]', e?.message || e);
    process.exit(1);
  }
}

main().catch(e => {
  log('[fatal]', e?.message || e);
  process.exit(1);
});
