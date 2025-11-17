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

    // Get progress from active generation cycle (most accurate, reflects worker progress)
    let activeCycle = null;
    if (agent.stage === 'researching' || agent.stage === 'building_glossary' || agent.stage === 'building_chunks' ||
        agent.stage === 'regenerating_research' || agent.stage === 'regenerating_glossary' || agent.stage === 'regenerating_chunks') {
      // Map stage to cycle_type
      const cycleTypeMap: Record<string, string> = {
        'researching': 'research',
        'regenerating_research': 'research',
        'building_glossary': 'glossary',
        'regenerating_glossary': 'glossary',
        'building_chunks': 'chunks',
        'regenerating_chunks': 'chunks',
      };
      const cycleType = cycleTypeMap[agent.stage];
      
      if (cycleType) {
        // Get the most recent generation cycle for this stage (including completed ones for progress display)
        // Prefer active cycles, but fall back to completed if no active ones exist
        const { data: activeCycles } = await (supabase
          .from('generation_cycles') as any)
          .select('id, progress_current, progress_total, status')
          .eq('event_id', eventId)
          .eq('agent_id', agentId)
          .eq('cycle_type', cycleType)
          .in('status', ['started', 'processing'])
          .order('started_at', { ascending: false })
          .limit(1);
        
        if (activeCycles && activeCycles.length > 0) {
          activeCycle = activeCycles[0];
        } else {
          // If no active cycle, check for most recent completed cycle (for progress display)
          const { data: completedCycles } = await (supabase
            .from('generation_cycles') as any)
            .select('id, progress_current, progress_total, status')
            .eq('event_id', eventId)
            .eq('agent_id', agentId)
            .eq('cycle_type', cycleType)
            .eq('status', 'completed')
            .order('started_at', { ascending: false })
            .limit(1);
          
          if (completedCycles && completedCycles.length > 0) {
            activeCycle = completedCycles[0];
          }
        }
      }
    }

    // Calculate progress based on stage
    if (agent.stage === 'researching' || agent.stage === 'regenerating_research') {
      stage = agent.stage === 'regenerating_research' ? 'regenerating_research' : 'researching';
      // Use progress from generation cycle if available
      if (activeCycle && activeCycle.progress_total > 0) {
        progress = {
          current: activeCycle.progress_current || 0,
          total: activeCycle.progress_total,
          percentage: Math.round(((activeCycle.progress_current || 0) / activeCycle.progress_total) * 100),
        };
      }
    } else if (agent.stage === 'building_glossary' || agent.stage === 'regenerating_glossary') {
      stage = agent.stage === 'regenerating_glossary' ? 'regenerating_glossary' : 'building_glossary';
      // Use progress from generation cycle if available (reflects actual terms being built)
      if (activeCycle && activeCycle.progress_total > 0) {
        progress = {
          current: activeCycle.progress_current || 0,
          total: activeCycle.progress_total,
          percentage: Math.round(((activeCycle.progress_current || 0) / activeCycle.progress_total) * 100),
        };
      }
    } else if (agent.stage === 'building_chunks' || agent.stage === 'regenerating_chunks') {
      stage = agent.stage === 'regenerating_chunks' ? 'regenerating_chunks' : 'building_chunks';
      // Use progress from generation cycle if available (reflects actual chunks being built)
      if (activeCycle && activeCycle.progress_total > 0) {
        progress = {
          current: activeCycle.progress_current || 0,
          total: activeCycle.progress_total,
          percentage: Math.round(((activeCycle.progress_current || 0) / activeCycle.progress_total) * 100),
        };
      }
    }

    // Check if context items exist for regeneration
    const { count: researchCount } = await (supabase
      .from('research_results') as any)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    
    const { count: glossaryCount } = await (supabase
      .from('glossary_terms') as any)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    
    const { count: chunksCount } = await (supabase
      .from('context_items') as any)
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);

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
      hasResearch: (researchCount || 0) > 0,
      hasGlossary: (glossaryCount || 0) > 0,
      hasChunks: (chunksCount || 0) > 0,
    });
  } catch (error: any) {
    console.error('[api/context/status] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
