import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Agent Information API Route
 * 
 * Returns comprehensive agent information for an event, including:
 * - Agent details (status, model, created_at, etc.)
 * - Context statistics (chunk count, glossary term count)
 * - Blueprint information (if exists)
 * 
 * GET /api/agent/[eventId]
 */

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch agent with all details
    const { data: agents, error: agentError } = await (supabase
      .from('agents') as any)
      .select('*')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/agent] Error fetching agent:', agentError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({
        ok: true,
        agent: null,
        contextStats: null,
        blueprint: null,
      });
    }

    const agent = agents[0];
    const agentId = agent.id;

    // Fetch context statistics in parallel
    const [chunksResult, glossaryResult, blueprintResult] = await Promise.all([
      // Get chunk count
      (supabase.from('context_items') as any)
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId),
      
      // Get glossary term count
      (supabase.from('glossary_terms') as any)
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId),
      
      // Get latest blueprint
      (supabase.from('context_blueprints') as any)
        .select('id, status, created_at, approved_at, target_chunk_count, estimated_cost, quality_tier')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const contextStats = {
      chunkCount: chunksResult.count || 0,
      glossaryTermCount: glossaryResult.count || 0,
    };

    const blueprint = blueprintResult.data || null;

    return NextResponse.json({
      ok: true,
      agent: {
        id: agent.id,
        event_id: agent.event_id,
        status: agent.status,
        model: agent.model,
        created_at: agent.created_at,
        updated_at: agent.updated_at,
      },
      contextStats: contextStats,
      blueprint: blueprint ? {
        id: blueprint.id,
        status: blueprint.status,
        created_at: blueprint.created_at,
        approved_at: blueprint.approved_at,
        target_chunk_count: blueprint.target_chunk_count,
        estimated_cost: blueprint.estimated_cost,
        quality_tier: blueprint.quality_tier,
      } : null,
    });
  } catch (error: any) {
    console.error('[api/agent] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
