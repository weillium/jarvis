import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Orchestrator, OrchestratorConfig } from './orchestrator';

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
const GEN_MODEL     = process.env.GEN_MODEL   || 'gpt-4o-mini';
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';

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
};

const orchestrator = new Orchestrator(orchestratorConfig);

// Track agents currently being processed to prevent duplicate processing
const processingAgents = new Set<string>();

/** ---------- prep loop (polling for agents that need prep) ---------- **/
async function tickPrep() {
  const { data: prep, error } = await supabase
    .from('agents')
    .select('id,event_id,status')
    .eq('status', 'prepping')
    .limit(20);
  
  if (error) {
    log('[prep] fetch error:', error.message);
    return;
  }
  
  if (!prep || prep.length === 0) {
    return;
  }

  for (const ag of prep) {
    // Skip if already processing this agent
    if (processingAgents.has(ag.id)) {
      log('[prep] Agent', ag.id, 'already being processed, skipping');
      continue;
    }

    // Check if context already exists for this event (prevent duplicates)
    const { data: existingContext, error: contextError } = await supabase
      .from('context_items')
      .select('id')
      .eq('event_id', ag.event_id)
      .limit(1);

    if (contextError) {
      log('[prep] Error checking existing context:', contextError.message);
      continue;
    }

    // If context already exists, mark agent as ready and skip
    if (existingContext && existingContext.length > 0) {
      log('[prep] Context already exists for event', ag.event_id, '- marking agent as ready');
      await supabase.from('agents').update({ status: 'ready' }).eq('id', ag.id);
      continue;
    }

    // Mark as processing
    processingAgents.add(ag.id);

    try {
      log('[prep] preparing agent', ag.id, 'event', ag.event_id);
      await orchestrator.prepareEvent(ag.event_id, ag.id);
      log('[prep] ready agent', ag.id, 'event', ag.event_id);
    } catch (e: any) {
      log('[prep] error', e?.message || e);
      await supabase.from('agents').update({ status: 'error' }).eq('id', ag.id);
    } finally {
      // Always remove from processing set
      processingAgents.delete(ag.id);
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
    // Check if we have a ready agent for this event
    const { data: ready } = await supabase
      .from('agents')
      .select('id,event_id,status')
      .eq('event_id', ev.id)
      .eq('status', 'ready')
      .limit(1);
    
    if (ready && ready[0]) {
      // Start the event in orchestrator
      try {
        await orchestrator.startEvent(ev.id, ready[0].id);
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
    
    // Start polling loops for prep and run
    // Note: These are fallbacks for agents that need prep or events that need to start
    // The main processing happens via Realtime subscriptions (event-driven)
    setInterval(tickPrep, 3000); // Check for agents needing prep every 3s
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
