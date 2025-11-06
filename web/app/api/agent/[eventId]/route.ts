import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';

/**
 * Agent Information API Route
 * 
 * Returns comprehensive agent information for an event, including:
 * - Agent details (status, model, created_at, etc.)
 * - Context statistics (chunk count, glossary term count)
 * - Blueprint information (if exists)
 * 
 * GET /api/agent/[eventId]
 * 
 * Requires authentication and event ownership.
 */

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

    // Check authentication and event ownership
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

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

    // Fetch context statistics in parallel, excluding items from superseded generation cycles
    // First, get all active (non-superseded) generation cycle IDs
    const [activeChunksCycles, activeGlossaryCycles, blueprintResult] = await Promise.all([
      // Get active chunks/research cycle IDs
      (supabase.from('generation_cycles') as any)
        .select('id')
        .eq('event_id', eventId)
        .neq('status', 'superseded')
        .in('cycle_type', ['chunks', 'research']),
      
      // Get active glossary cycle IDs
      (supabase.from('generation_cycles') as any)
        .select('id')
        .eq('event_id', eventId)
        .neq('status', 'superseded')
        .in('cycle_type', ['glossary']),
      
      // Get latest blueprint
      (supabase.from('context_blueprints') as any)
        .select('id, status, created_at, approved_at, target_chunk_count, estimated_cost, quality_tier')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Build lists of active cycle IDs
    const activeChunksCycleIds: string[] = [];
    if (activeChunksCycles.data && activeChunksCycles.data.length > 0) {
      activeChunksCycleIds.push(...activeChunksCycles.data.map((c: { id: string }) => c.id));
    }

    const activeGlossaryCycleIds: string[] = [];
    if (activeGlossaryCycles.data && activeGlossaryCycles.data.length > 0) {
      activeGlossaryCycleIds.push(...activeGlossaryCycles.data.map((c: { id: string }) => c.id));
    }

    // Fetch counts, excluding items from superseded generation cycles
    // Handle null generation_cycle_id separately since .in() doesn't match NULL
    let chunksQuery = (supabase.from('context_items') as any)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    
    if (activeChunksCycleIds.length > 0) {
      chunksQuery = chunksQuery.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeChunksCycleIds.join(',')})`);
    } else {
      chunksQuery = chunksQuery.is('generation_cycle_id', null);
    }
    
    let glossaryQuery = (supabase.from('glossary_terms') as any)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    
    if (activeGlossaryCycleIds.length > 0) {
      glossaryQuery = glossaryQuery.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeGlossaryCycleIds.join(',')})`);
    } else {
      glossaryQuery = glossaryQuery.is('generation_cycle_id', null);
    }

    const [chunksResult, glossaryResult] = await Promise.all([
      chunksQuery,
      glossaryQuery,
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
        stage: agent.stage || null,
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
