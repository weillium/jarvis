import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import { Orchestrator, OrchestratorConfig } from './core/orchestrator';
import { ModelSelectionService } from './services/model-selection-service';
import { SupabaseService } from './services/supabase-service';
import { OpenAIService } from './services/openai-service';
import { SSEService } from './services/sse-service';
import { Logger } from './monitoring/logger';
import { MetricsCollector } from './monitoring/metrics-collector';
import { StatusUpdater } from './monitoring/status-updater';
import { CheckpointManager } from './monitoring/checkpoint-manager';
import { GlossaryManager } from './context/glossary-manager';
import { VectorSearchService } from './context/vector-search';
import { ContextBuilder } from './context/context-builder';
import { CardsProcessor } from './processing/cards-processor';
import { FactsProcessor } from './processing/facts-processor';
import { TranscriptProcessor } from './processing/transcript-processor';
import { SessionFactory } from './sessions/session-factory';
import { SessionManager } from './sessions/session-manager';
import { RuntimeManager } from './core/runtime-manager';
import { EventProcessor } from './core/event-processor';
import { BlueprintPoller } from './polling/blueprint-poller';
import { ContextPoller } from './polling/context-poller';
import { RegenerationPoller } from './polling/regeneration-poller';
import { PauseResumePoller } from './polling/pause-resume-poller';
import { SessionStartupPoller } from './polling/session-startup-poller';

/** ---------- env ---------- **/
function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
const SUPABASE_URL  = need('SUPABASE_URL');
const SERVICE_ROLE  = need('SUPABASE_SERVICE_ROLE_KEY');
const OPENAI_KEY    = need('OPENAI_API_KEY');
const EMBED_MODEL   = process.env.CONTEXT_CHUNKS_MODEL || 'text-embedding-3-small';
const CONTEXT_GEN_MODEL = process.env.CONTEXT_BLUEPRINT_MODEL || 'gpt-5';
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
const EXA_API_KEY   = process.env.EXA_API_KEY; // Optional - fallback to stub if not provided
// Clean SSE_ENDPOINT - remove backticks and other invalid characters
const SSE_ENDPOINT_RAW = process.env.SSE_ENDPOINT || 'http://localhost:3000';
const SSE_ENDPOINT = SSE_ENDPOINT_RAW.trim().replace(/[`'"]/g, ''); // Base URL for SSE push endpoint

/** ---------- services ---------- **/
const supabaseService = new SupabaseService(SUPABASE_URL, SERVICE_ROLE);
const supabaseClient = supabaseService.getClient();
const openaiService = new OpenAIService(OPENAI_KEY, EMBED_MODEL, CONTEXT_GEN_MODEL);
const openai = openaiService.getClient();
const sseService = new SSEService(SSE_ENDPOINT);
const modelSelectionService = new ModelSelectionService();

/** ---------- helpers ---------- **/
function log(...a: any[]) { console.log(new Date().toISOString(), ...a); }

/** ---------- monitoring ---------- **/
const logger = new Logger();
const metricsCollector = new MetricsCollector();
const checkpointManager = new CheckpointManager(supabaseService);
const statusUpdater = new StatusUpdater(
  supabaseService,
  sseService,
  logger,
  metricsCollector,
  REALTIME_MODEL
);

/** ---------- context ---------- **/
const glossaryManager = new GlossaryManager(supabaseService);
const vectorSearchService = new VectorSearchService(supabaseService, openaiService);
const contextBuilder = new ContextBuilder(glossaryManager);

/** ---------- processing ---------- **/
const determineCardType = (
  card: any,
  transcriptText: string
): 'text' | 'text_visual' | 'visual' => {
  if (card.image_url) {
    return card.body ? 'text_visual' : 'visual';
  }

  const lowerText = transcriptText.toLowerCase();
  const visualKeywords = [
    'photo',
    'image',
    'picture',
    'diagram',
    'chart',
    'graph',
    'map',
    'illustration',
    'visual',
    'showing',
    'depicts',
    'looks like',
    'appearance',
    'shape',
    'structure',
    'location',
    'geography',
  ];
  const hasVisualKeyword = visualKeywords.some((keyword) => lowerText.includes(keyword));

  const definitionKeywords = [
    'is',
    'are',
    'means',
    'refers to',
    'definition',
    'explain',
    'describe',
    'what is',
    'who is',
    'where is',
    'what are',
  ];
  const isDefinition = definitionKeywords.some((keyword) => lowerText.includes(keyword));

  if (isDefinition && hasVisualKeyword) {
    return 'text_visual';
  }
  if (hasVisualKeyword && !card.body) {
    return 'visual';
  }
  return 'text';
};

const cardsProcessor = new CardsProcessor(
  contextBuilder,
  supabaseService,
  openaiService,
  logger,
  metricsCollector,
  checkpointManager,
  determineCardType
);

const factsProcessor = new FactsProcessor(
  contextBuilder,
  supabaseService,
  openaiService,
  logger,
  metricsCollector,
  checkpointManager
);

const transcriptProcessor = new TranscriptProcessor(supabaseService);

/** ---------- sessions ---------- **/
const sessionFactory = new SessionFactory(
  openai,
  openaiService,
  vectorSearchService,
  REALTIME_MODEL
);
const sessionManager = new SessionManager(sessionFactory, supabaseService, logger);

/** ---------- core ---------- **/
const runtimeManager = new RuntimeManager(
  supabaseService,
  glossaryManager,
  checkpointManager,
  metricsCollector,
  logger
);

const eventProcessor = new EventProcessor(
  cardsProcessor,
  factsProcessor,
  transcriptProcessor,
  supabaseService,
  determineCardType
);

const orchestratorConfig: OrchestratorConfig = {
  supabase: supabaseClient,
  openai,
  embedModel: EMBED_MODEL,
  genModel: CONTEXT_GEN_MODEL,
  realtimeModel: REALTIME_MODEL,
  sseEndpoint: SSE_ENDPOINT,
};

const orchestrator = new Orchestrator(
  orchestratorConfig,
  supabaseService,
  openaiService,
  logger,
  metricsCollector,
  checkpointManager,
  glossaryManager,
  vectorSearchService,
  sessionManager,
  runtimeManager,
  eventProcessor,
  statusUpdater,
  modelSelectionService
);

// Track agents currently being processed to prevent duplicate processing across pollers
const processingAgents = new Set<string>();

/** ---------- poller instances ---------- **/
const blueprintPoller = new BlueprintPoller(
  supabaseClient,
  openai,
  CONTEXT_GEN_MODEL,
  processingAgents,
  log
);

const contextPoller = new ContextPoller(
  supabaseClient,
  openai,
  EMBED_MODEL,
  CONTEXT_GEN_MODEL,
  EXA_API_KEY,
  processingAgents,
  log
);

const regenerationPoller = new RegenerationPoller(
  supabaseClient,
  openai,
  EMBED_MODEL,
  CONTEXT_GEN_MODEL,
  EXA_API_KEY,
  processingAgents,
  log
);

const pauseResumePoller = new PauseResumePoller(supabaseClient, orchestrator, log);
const sessionStartupPoller = new SessionStartupPoller(supabaseClient, orchestrator, log);

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
