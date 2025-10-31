import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

/** ---------- env ---------- **/
function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
const SUPABASE_URL  = need('SUPABASE_URL');              // e.g., http://localhost:54321
const SERVICE_ROLE  = need('SUPABASE_SERVICE_ROLE_KEY'); // service key (server-only)
const OPENAI_KEY    = need('OPENAI_API_KEY');            // for embeddings + cards
const EMBED_MODEL   = process.env.EMBED_MODEL || 'text-embedding-3-small';
const GEN_MODEL     = process.env.GEN_MODEL   || 'gpt-4o-mini';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const openai   = new OpenAI({ apiKey: OPENAI_KEY });

/** ---------- helpers ---------- **/
function log(...a: any[]) { console.log(new Date().toISOString(), ...a); }

async function embed(text: string) {
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  return res.data[0].embedding;
}

function chunkText(text: string, maxLen = 1200) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) chunks.push(text.slice(i, i + maxLen));
  return chunks;
}

async function rpcMatchContext(event_id: string, query: number[], k = 5) {
  const { data, error } = await supabase.rpc('match_context', {
    p_event: event_id,
    p_query: query,
    p_limit: k
  });
  if (error) {
    log('[rpc match_context] error:', error.message);
    return [];
  }
  return (data || []) as { id: string; chunk: string; similarity: number }[];
}

/** ---------- runtime registry ---------- **/
type AgentRuntime = {
  agentId: string;
  eventId: string;
  status: 'ready' | 'running';
  lastTranscriptId: number; // per-event checkpoint
};

const agents = new Map<string, AgentRuntime>(); // key = eventId

/** ---------- 1) PREP: build local context DB ---------- **/
async function fetchPreppingAgents() {
  const { data, error } = await supabase
    .from('agents')
    .select('id,event_id,status')
    .eq('status', 'prepping')
    .limit(20);
  if (error) {
    log('[prepping] fetch error:', error.message);
    return [];
  }
  return data || [];
}

async function buildContext(event_id: string) {
  // 1) Gather doc placeholders (swap with real fetch & text extraction later)
  const { data: docs, error: docErr } = await supabase
    .from('event_docs')
    .select('id,path')
    .eq('event_id', event_id)
    .limit(50);
  if (docErr) log('[context] docs fetch error:', docErr.message);

  // For now, seed some generic text + doc paths to make vector index useful
  const seedTexts = [
    `Event ${event_id}: common topics include strategy, KPIs, churn, pricing, roadmap, stakeholders.`,
    ...(docs?.map(d => `Doc path: ${d.path}`) ?? [])
  ];

  for (const seed of seedTexts) {
    for (const chunk of chunkText(seed)) {
      const e = await embed(chunk);
      const ins = await supabase.from('context_items').insert({
        event_id, source: 'seed', chunk, embedding: e
      });
      if (ins.error) log('[context] insert error:', ins.error.message);
    }
  }

  log('[context] built for event', event_id, `(${seedTexts.length} seed items)`);
}

/** ---------- 2) RUN: stream transcripts -> cards ---------- **/
async function processNewTranscripts(rt: AgentRuntime) {
  // fetch any transcripts newer than our checkpoint
  const { data, error } = await supabase
    .from('transcripts')
    .select('id,text')
    .eq('event_id', rt.eventId)
    .gt('id', rt.lastTranscriptId)
    .order('id', { ascending: true })
    .limit(100);
  if (error) {
    log('[transcripts] fetch error:', error.message);
    return;
  }
  if (!data || data.length === 0) return;

  for (const row of data) {
    rt.lastTranscriptId = Math.max(rt.lastTranscriptId, row.id as number);

    // 1) vector search
    const qEmb = await embed(row.text);
    const ctxHits = await rpcMatchContext(rt.eventId, qEmb, 5);
    const contextJoin = ctxHits.map(h => h.chunk).join('\n');

    // 2) generate card (<5s path)
    const sys = `You output a single concise JSON "context card" strictly as:
{"kind": string, "title": string, "body": string}. Keep it short, factually grounded, immediately useful.`;
    const user = `Transcript:\n${row.text}\n\nNearest context:\n${contextJoin}`;
    const res = await openai.chat.completions.create({
      model: GEN_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      response_format: { type: 'json_object' }
    });

    let card: any = { kind: 'Context', title: 'Update', body: row.text.slice(0, 140) };
    try { card = JSON.parse(res.choices[0]?.message?.content || '{}'); } catch {}

    const ins = await supabase.from('cards').insert({
      event_id: rt.eventId,
      kind: card.kind || 'Context',
      payload: card
    });
    if (ins.error) log('[cards] insert error:', ins.error.message);
    else log('[cards] +1 for event', rt.eventId, 'from transcript', row.id);
  }
}

/** ---------- loops ---------- **/
async function tickPrep() {
  const prep = await fetchPreppingAgents();
  if (prep.length === 0) {
    log('[prep] none');
    return;
  }
  for (const ag of prep) {
    try {
      log('[prep] preparing agent', ag.id, 'event', ag.event_id);
      await buildContext(ag.event_id);
      // agent ready
      await supabase.from('agents').update({ status: 'ready' }).eq('id', ag.id);
      // seed runtime
      const { data: last } = await supabase
        .from('transcripts')
        .select('id')
        .eq('event_id', ag.event_id)
        .order('id', { ascending: false })
        .limit(1);
      agents.set(ag.event_id, {
        agentId: ag.id,
        eventId: ag.event_id,
        status: 'ready',
        lastTranscriptId: last?.[0]?.id ?? 0
      });
      log('[prep] ready agent', ag.id, 'event', ag.event_id);
    } catch (e: any) {
      log('[prep] error', e?.message || e);
      await supabase.from('agents').update({ status: 'error' }).eq('id', ag.id);
    }
  }
}

async function tickRun() {
  // get live events
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
    // skip if no prepped agent yet
    let rt = agents.get(ev.id);
    if (!rt) {
      // try to find a ready agent for this event
      const { data: ready } = await supabase
        .from('agents')
        .select('id,event_id,status')
        .eq('event_id', ev.id)
        .eq('status', 'ready')
        .limit(1);
      if (ready && ready[0]) {
        // init runtime with current transcript checkpoint
        const { data: last } = await supabase
          .from('transcripts')
          .select('id')
          .eq('event_id', ev.id)
          .order('id', { ascending: false })
          .limit(1);
        rt = {
          agentId: ready[0].id,
          eventId: ev.id,
          status: 'running',
          lastTranscriptId: last?.[0]?.id ?? 0
        };
        agents.set(ev.id, rt);
        log('[run] attached ready agent to live event', ev.id);
      } else {
        // no ready agent; nothing to do yet
        continue;
      }
    }

    // mark running if still 'ready'
    if (rt.status === 'ready') {
      rt.status = 'running';
      await supabase.from('agents').update({ status: 'running' }).eq('id', rt.agentId);
      log('[run] agent -> running', rt.agentId, 'event', rt.eventId);
    }

    // process new transcripts for this event
    await processNewTranscripts(rt);
  }
}

async function main() {
  log('Worker running…');
  // immediate kick
  await tickPrep();
  await tickRun();
  // intervals
  setInterval(tickPrep, 3000); // prep new agents quickly
  setInterval(tickRun, 1000);  // sub-5s loop for transcripts -> cards
}

main().catch(e => log('[fatal]', e?.message || e));