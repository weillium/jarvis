import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Orchestrator, OrchestratorConfig } from './orchestrator';
import { generateContextBlueprint } from './blueprint-generator';
import { executeContextGeneration, regenerateResearchStage, regenerateGlossaryStage, regenerateChunksStage } from './context-generation-orchestrator';

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
  supabase,
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
          supabase,
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
          supabase,
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
        supabase,
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
    // Check if event is live
    const { data: event } = await supabase
      .from('events')
      .select('is_live')
      .eq('id', session.event_id)
      .single();
    
    if (!event || !event.is_live) {
      continue;
    }

    // Check if agent is running
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

/** ---------- run loop (polling for ready agents that need to start) ---------- **/
async function tickRun() {
  // Find events that are live but don't have running orchestrator runtime
  const { data: live, error } = await supabase
    .from('events')
    .select('id')
    .eq('is_live', true)
    .limit(50);
  
  if (error) {
    log('[run] live fetch error:', error.message);
    return;
  }
  
  if (!live) return;

  for (const ev of live) {
    // Check if we have a ready agent for this event (must have 'context_complete' status)
    const { data: readyAgents, error: agentError } = await supabase
      .from('agents')
      .select('id,event_id,status')
      .eq('event_id', ev.id)
      .eq('status', 'context_complete')
      .limit(1);
    
    if (agentError) {
      log('[run] agent fetch error for event', ev.id, agentError.message);
      continue;
    }
    
    if (readyAgents && readyAgents[0]) {
      // Start the event in orchestrator
      try {
        await orchestrator.startEvent(ev.id, readyAgents[0].id);
      } catch (e: any) {
        log('[run] error starting event', ev.id, e?.message || e);
      }
    }
  }
}

/** ---------- main ---------- **/
async function main() {
  log('Worker/Orchestrator starting...');
  
  try {
    // Initialize orchestrator (subscribes to Realtime, resumes events)
    await orchestrator.initialize();
    
    // Start polling loops for blueprint generation, context generation, pause/resume, and run
    // Note: These are fallbacks for agents that need blueprint/execution or events that need to start
    // The main processing happens via Realtime subscriptions (event-driven)
    setInterval(tickBlueprint, 3000); // Check for agents needing blueprint generation every 3s
    setInterval(tickContextGeneration, 3000); // Check for approved blueprints needing execution every 3s
    setInterval(tickRegeneration, 3000); // Check for agents needing stage regeneration every 3s
    setInterval(tickPauseResume, 5000); // Check for sessions needing pause/resume every 5s
    setInterval(tickRun, 5000);  // Check for events needing start every 5s
    
    log('Worker/Orchestrator running...');
  } catch (e: any) {
    log('[fatal]', e?.message || e);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  log('[shutdown] SIGTERM received');
  await orchestrator.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('[shutdown] SIGINT received');
  await orchestrator.shutdown();
  process.exit(0);
});

main().catch(e => {
  log('[fatal]', e?.message || e);
  process.exit(1);
});
