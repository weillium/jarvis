import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Orchestrator, OrchestratorConfig } from './orchestrator';
import { generateContextBlueprint } from './blueprint-generator';
import { executeContextGeneration, regenerateResearchStage, regenerateGlossaryStage, regenerateChunksStage } from './context-generation-orchestrator';
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

// Track agents currently being processed to prevent duplicate processing
const processingAgents = new Set<string>();

/** ---------- blueprint loop (polling for agents that need blueprint generation) ---------- **/
async function tickBlueprint() {
  const { data: blueprintAgents, error } = await supabase
    .from('agents')
    .select('id,event_id,status')
    .eq('status', 'blueprint_generating')
    .limit(20);
  
  if (error) {
    log('[blueprint] fetch error:', error.message);
    return;
  }
  
  if (!blueprintAgents || blueprintAgents.length === 0) {
    return;
  }

  for (const ag of blueprintAgents) {
    // Skip if already processing this agent
    if (processingAgents.has(ag.id)) {
      log('[blueprint] Agent', ag.id, 'already being processed, skipping');
      continue;
    }

    // Mark as processing
    processingAgents.add(ag.id);

    try {
      log('[blueprint] generating blueprint for agent', ag.id, 'event', ag.event_id);
      const blueprintId = await generateContextBlueprint(
        ag.event_id,
        ag.id,
        {
          supabase: supabase as any as ReturnType<typeof createClient>,
          openai,
          genModel: GEN_MODEL,
        }
      );
      log('[blueprint] blueprint generated successfully', blueprintId, 'for agent', ag.id);
    } catch (e: any) {
      log('[blueprint] error', e?.message || e);
      await supabase.from('agents').update({ status: 'error' }).eq('id', ag.id);
    } finally {
      // Always remove from processing set
      processingAgents.delete(ag.id);
    }
  }
}

/** ---------- context generation loop (polling for approved blueprints to execute) ---------- **/
async function tickContextGeneration() {
  const { data: approvedAgents, error } = await supabase
    .from('agents')
    .select('id,event_id,status')
    .eq('status', 'blueprint_approved')
    .limit(20);
  
  if (error) {
    log('[context-gen] fetch error:', error.message);
    return;
  }
  
  if (!approvedAgents || approvedAgents.length === 0) {
    return;
  }

  for (const ag of approvedAgents) {
    // Skip if already processing this agent
    if (processingAgents.has(ag.id)) {
      log('[context-gen] Agent', ag.id, 'already being processed, skipping');
      continue;
    }

    // Fetch the blueprint for this agent
    const { data: blueprint, error: blueprintError } = await ((supabase
      .from('context_blueprints') as any)
      .select('id')
      .eq('agent_id', ag.id)
      .eq('status', 'approved')
      .limit(1)
      .single()) as { data: { id: string } | null; error: any };

    if (blueprintError || !blueprint) {
      log('[context-gen] No approved blueprint found for agent', ag.id);
      continue;
    }

    // Mark as processing
    processingAgents.add(ag.id);

    try {
      log('[context-gen] executing context generation for agent', ag.id, 'event', ag.event_id, 'blueprint', blueprint.id);
      await executeContextGeneration(
        ag.event_id,
        ag.id,
        blueprint.id,
        {
          supabase: supabase as any as ReturnType<typeof createClient>,
          openai,
          embedModel: EMBED_MODEL,
          genModel: GEN_MODEL,
          exaApiKey: EXA_API_KEY,
        }
      );
      log('[context-gen] context generation complete for agent', ag.id);
    } catch (e: any) {
      log('[context-gen] error', e?.message || e);
      await supabase.from('agents').update({ status: 'error' }).eq('id', ag.id);
    } finally {
      // Always remove from processing set
      processingAgents.delete(ag.id);
    }
  }
}

/** ---------- regeneration loop (polling for agents needing stage regeneration) ---------- **/
async function tickRegeneration() {
  const regenerationStatuses = ['regenerating_research', 'regenerating_glossary', 'regenerating_chunks'];
  
  const { data: regeneratingAgents, error } = await supabase
    .from('agents')
    .select('id,event_id,status')
    .in('status', regenerationStatuses)
    .limit(20);
  
  if (error) {
    log('[regeneration] fetch error:', error.message);
    return;
  }
  
  if (!regeneratingAgents || regeneratingAgents.length === 0) {
    return;
  }

  for (const ag of regeneratingAgents) {
    // Skip if already processing this agent
    if (processingAgents.has(ag.id)) {
      log('[regeneration] Agent', ag.id, 'already being processed, skipping');
      continue;
    }

    // Fetch the approved blueprint for this agent
    const { data: blueprint, error: blueprintError } = await ((supabase
      .from('context_blueprints') as any)
      .select('id')
      .eq('agent_id', ag.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as { data: { id: string } | null; error: any };

    if (blueprintError || !blueprint) {
      log('[regeneration] No approved blueprint found for agent', ag.id);
      continue;
    }

    // Mark as processing
    processingAgents.add(ag.id);

    try {
      const options = {
        supabase: supabase as any as ReturnType<typeof createClient>,
        openai,
        embedModel: EMBED_MODEL,
        genModel: GEN_MODEL,
        exaApiKey: EXA_API_KEY,
      };

      if (ag.status === 'regenerating_research') {
        log('[regeneration] regenerating research for agent', ag.id);
        await regenerateResearchStage(ag.event_id, ag.id, blueprint.id, options);
        // regenerateResearchStage now auto-regenerates downstream components
        // Status will be set to context_complete or researching by the function
      } else if (ag.status === 'regenerating_glossary') {
        log('[regeneration] regenerating glossary for agent', ag.id);
        await regenerateGlossaryStage(ag.event_id, ag.id, blueprint.id, options);
        // After glossary regeneration, set status back to context_complete
        await supabase.from('agents').update({ status: 'context_complete' }).eq('id', ag.id);
      } else if (ag.status === 'regenerating_chunks') {
        log('[regeneration] regenerating chunks for agent', ag.id);
        await regenerateChunksStage(ag.event_id, ag.id, blueprint.id, options);
        // regenerateChunksStage already sets status to context_complete
      }

      log('[regeneration] regeneration complete for agent', ag.id);
    } catch (e: any) {
      log('[regeneration] error', e?.message || e);
      await supabase.from('agents').update({ status: 'error' }).eq('id', ag.id);
    } finally {
      // Always remove from processing set
      processingAgents.delete(ag.id);
    }
  }
}

/** ---------- pause/resume loop (handle paused sessions) ---------- **/
async function tickPauseResume() {
  // Find sessions that are marked as paused in DB but may still be active in runtime
  const { data: pausedSessions, error: pausedError } = await supabase
    .from('agent_sessions')
    .select('event_id, agent_id')
    .eq('status', 'paused')
    .limit(50);
  
  if (pausedError) {
    log('[pause-resume] fetch error:', pausedError.message);
    return;
  }
  
  if (!pausedSessions || pausedSessions.length === 0) {
    return;
  }

  // Group by event_id
  const eventsToPause = new Map<string, string>(); // eventId -> agentId
  for (const session of pausedSessions) {
    if (!eventsToPause.has(session.event_id)) {
      eventsToPause.set(session.event_id, session.agent_id);
    }
  }

  // Pause events that have paused sessions in DB but are still active in runtime
  for (const [eventId, agentId] of eventsToPause) {
    try {
      // Check if runtime exists and sessions are still active (needs to be paused)
      const runtime = orchestrator.getRuntime(eventId);
      if (runtime && runtime.status === 'running') {
        const cardsActive = runtime.cardsSession?.getStatus().isActive;
        const factsActive = runtime.factsSession?.getStatus().isActive;
        
        if (cardsActive || factsActive) {
          log('[pause-resume] Pausing event', eventId, '- sessions are still active');
          await orchestrator.pauseEvent(eventId);
        }
      }
    } catch (e: any) {
      log('[pause-resume] error pausing event', eventId, e?.message || e);
    }
  }

  // Find sessions that are paused but event is live and agent is running (should resume)
  // Use separate queries to avoid complex joins
  const { data: pausedForResume, error: pausedError2 } = await supabase
    .from('agent_sessions')
    .select('event_id, agent_id')
    .eq('status', 'paused')
    .limit(50);
  
  if (pausedError2 || !pausedForResume || pausedForResume.length === 0) {
    return;
  }

  // Check each event to see if it should be resumed
  const eventsToResume = new Map<string, string>(); // eventId -> agentId
  for (const session of pausedForResume) {
    // Check if agent is running (agent status is the indicator for processing)
    const { data: agent } = await supabase
      .from('agents')
      .select('status')
      .eq('id', session.agent_id)
      .single();
    
    if (agent && agent.status === 'running') {
      if (!eventsToResume.has(session.event_id)) {
        eventsToResume.set(session.event_id, session.agent_id);
      }
    }
  }

  // Resume events
  for (const [eventId, agentId] of eventsToResume) {
    try {
      log('[pause-resume] Resuming event', eventId);
      await orchestrator.resumeEvent(eventId, agentId);
    } catch (e: any) {
      log('[pause-resume] error resuming event', eventId, e?.message || e);
    }
  }
}

/** ---------- start generated sessions loop (polling for generated/paused sessions that need activation) ---------- **/
// This handles:
// 1. Testing workflow: when sessions are created with 'generated' status, and then the start API is called
// 2. Resume workflow: when sessions are paused and then the start API is called to resume them
// Sessions are updated to 'starting' and this loop activates/resumes them
async function tickStartGeneratedSessions() {
  // Find sessions with 'starting' status that need to be activated or resumed
  // These are sessions that were 'generated' or 'paused' and then the start API was called
  const { data: startingSessions, error: sessionsError } = await supabase
    .from('agent_sessions')
    .select('event_id, agent_id')
    .eq('status', 'starting')
    .limit(50);
  
  if (sessionsError) {
    log('[start-generated] fetch error:', sessionsError.message);
    return;
  }
  
  if (!startingSessions || startingSessions.length === 0) {
    return;
  }

  // Group by event_id and agent_id
  const eventsToStart = new Map<string, string>(); // eventId -> agentId
  for (const session of startingSessions) {
    if (!eventsToStart.has(session.event_id)) {
      eventsToStart.set(session.event_id, session.agent_id);
    }
  }

  // Start events that have starting sessions
  for (const [eventId, agentId] of eventsToStart) {
    try {
      // Check if runtime already exists and is running
      const runtime = orchestrator.getRuntime(eventId);
      if (runtime && runtime.status === 'running' && 
          runtime.cardsSession && runtime.factsSession) {
        // Already running, skip
        continue;
      }

      // Check if agent is in testing or running status (required for worker to process)
      const { data: agent } = await supabase
        .from('agents')
        .select('status')
        .eq('id', agentId)
        .single();

      if (!agent || (agent.status !== 'testing' && agent.status !== 'running')) {
        // Agent not in a state that allows processing, skip
        continue;
      }

      // Use lightweight testing method for 'testing' status, full startEvent for 'running'
      if (agent.status === 'testing') {
        log('[start-generated] Starting sessions for testing (event:', eventId, ')');
        await orchestrator.startSessionsForTesting(eventId, agentId);
      } else {
        log('[start-generated] Starting event', eventId, 'with generated sessions');
        await orchestrator.startEvent(eventId, agentId);
      }
    } catch (e: any) {
      log('[start-generated] error starting event', eventId, e?.message || e);
    }
  }
}

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
    setInterval(tickBlueprint, 3000); // Check for agents needing blueprint generation every 3s
    setInterval(tickContextGeneration, 3000); // Check for approved blueprints needing execution every 3s
    setInterval(tickRegeneration, 3000); // Check for agents needing stage regeneration every 3s
    setInterval(tickPauseResume, 5000); // Check for sessions needing pause/resume every 5s
    setInterval(tickStartGeneratedSessions, 5000); // Check for generated sessions that need to be started every 5s
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
