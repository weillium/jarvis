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

    // Fetch the approved or completed blueprint for this agent
    const { data: blueprint, error: blueprintError } = await ((supabase
      .from('context_blueprints') as any)
      .select('id')
      .eq('agent_id', ag.id)
      .in('status', ['approved', 'completed'])
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
      };

      if (ag.status === 'regenerating_research') {
        log('[regeneration] regenerating research for agent', ag.id);
        await regenerateResearchStage(ag.event_id, ag.id, blueprint.id, options);
        // After research regeneration, set status to researching (not regenerating)
        await supabase.from('agents').update({ status: 'researching' }).eq('id', ag.id);
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
    // Check if we have a ready agent for this event (supports both legacy 'ready' and new 'context_complete' statuses)
    const { data: readyAgents, error: agentError } = await supabase
      .from('agents')
      .select('id,event_id,status')
      .eq('event_id', ev.id)
      .in('status', ['ready', 'context_complete'])
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
    
    // Start polling loops for blueprint generation, context generation, and run
    // Note: These are fallbacks for agents that need blueprint/execution or events that need to start
    // The main processing happens via Realtime subscriptions (event-driven)
    setInterval(tickBlueprint, 3000); // Check for agents needing blueprint generation every 3s
    setInterval(tickContextGeneration, 3000); // Check for approved blueprints needing execution every 3s
    setInterval(tickRegeneration, 3000); // Check for agents needing stage regeneration every 3s
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
