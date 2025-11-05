import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';

/**
 * Context Generation Status API Route
 * 
 * Returns current status of context generation for an event, including:
 * - Agent status
 * - Blueprint status (if exists)
 * - Progress information
 * 
 * GET /api/context/[eventId]/status
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

    // Fetch agent
    const { data: agents, error: agentError } = await (supabase
      .from('agents') as any)
      .select('id, status, stage, created_at')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/context/status] Error fetching agent:', agentError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json({
        ok: true,
        agent: null,
        blueprint: null,
        status: 'no_agent',
        message: 'No agent found for this event',
      });
    }

    const agent = agents[0];
    const agentId = agent.id;

    // Fetch blueprint
    const { data: blueprints, error: blueprintError } = await (supabase
      .from('context_blueprints') as any)
      .select('id, status, created_at, approved_at, target_chunk_count, estimated_cost')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1);

    let blueprint = null;
    if (!blueprintError && blueprints && blueprints.length > 0) {
      blueprint = blueprints[0];
    }

    // Determine overall status and progress
    let stage: string = agent.stage || agent.status;
    let progress: { current: number; total: number; percentage: number } | null = null;

    // Special handling for blueprint stage: show 'blueprint_generating' when blueprint is being generated
    if (agent.stage === 'blueprint') {
      // If no blueprint exists yet, or blueprint is in 'generating' status, show as generating
      if (!blueprint || blueprint.status === 'generating') {
        stage = 'blueprint_generating';
      }
      // Otherwise, keep as 'blueprint' (blueprint is ready/approved)
    }

    // Calculate progress based on stage
    if (agent.stage === 'researching' || (agent.status === 'idle' && agent.stage === 'researching')) {
      stage = 'researching';
      // Progress would need to come from actual research results
      // For now, just indicate stage
    } else if (agent.stage === 'building_glossary' || (agent.status === 'idle' && agent.stage === 'building_glossary')) {
      stage = 'building_glossary';
      // Get glossary term count (from current generation cycle if available)
      // Note: After Phase 3, we filter by generation_cycle_id instead of is_active
      // For now, get all terms (we'll filter by cycle in later updates)
      const { count: glossaryCount } = await (supabase
        .from('glossary_terms') as any)
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId);
      
      // Estimate total based on blueprint (if available)
      // glossary_plan is JSONB, so it's already an object
      const glossaryPlan = blueprint?.glossary_plan as any;
      const estimatedTerms = glossaryPlan?.target_count || 50;
      
      progress = {
        current: glossaryCount || 0,
        total: estimatedTerms,
        percentage: Math.round(((glossaryCount || 0) / estimatedTerms) * 100),
      };
    } else if (agent.stage === 'building_chunks' || (agent.status === 'idle' && agent.stage === 'building_chunks')) {
      stage = 'building_chunks';
      // Get chunk count (from current generation cycle if available)
      // Note: After Phase 3, we filter by generation_cycle_id instead of is_active
      // For now, get all chunks (we'll filter by cycle in later updates)
      const { count: chunkCount } = await (supabase
        .from('context_items') as any)
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId);
      
      const targetChunks = blueprint?.target_chunk_count || 1000;
      progress = {
        current: chunkCount || 0,
        total: targetChunks,
        percentage: Math.round(((chunkCount || 0) / targetChunks) * 100),
      };
    }

    return NextResponse.json({
      ok: true,
      agent: {
        id: agent.id,
        status: agent.status,
        stage: agent.stage || null,
        created_at: agent.created_at,
      },
      blueprint: blueprint ? {
        id: blueprint.id,
        status: blueprint.status,
        created_at: blueprint.created_at,
        approved_at: blueprint.approved_at,
        target_chunk_count: blueprint.target_chunk_count,
        estimated_cost: blueprint.estimated_cost,
      } : null,
      stage: stage,
      progress: progress,
    });
  } catch (error: any) {
    console.error('[api/context/status] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
