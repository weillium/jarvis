import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Stage Regeneration API Route
 * 
 * Allows regenerating specific stages of context generation:
 * - research: Re-execute research plan
 * - glossary: Re-build glossary
 * - chunks: Re-build chunks
 * 
 * POST /api/context/[eventId]/regenerate?stage=chunks
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

const VALID_STAGES = ['research', 'glossary', 'chunks'] as const;
type Stage = typeof VALID_STAGES[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage') as Stage;

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    // Validate stage parameter
    if (!stage || !VALID_STAGES.includes(stage)) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `Invalid stage parameter. Must be one of: ${VALID_STAGES.join(', ')}` 
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Find agent for this event
    const { data: agents, error: agentError } = await (supabase
      .from('agents') as any)
      .select('id, status')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/context/regenerate] Error fetching agent:', agentError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No agent found for this event' },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Find approved blueprint (execution tracked via agent status and generation_cycles)
    const { data: blueprints, error: blueprintError } = await (supabase
      .from('context_blueprints') as any)
      .select('id, status')
      .eq('agent_id', agentId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false }) // Get the most recent one
      .limit(1);

    if (blueprintError) {
      console.error('[api/context/regenerate] Error fetching blueprint:', blueprintError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch blueprint: ${blueprintError.message}` },
        { status: 500 }
      );
    }

    if (!blueprints || blueprints.length === 0) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'No approved blueprint found. Please approve a blueprint first.' 
        },
        { status: 400 }
      );
    }

    const blueprintId = blueprints[0].id;

    // Map stage to agent status for regeneration
    const statusMap: Record<Stage, string> = {
      research: 'regenerating_research',
      glossary: 'regenerating_glossary',
      chunks: 'regenerating_chunks',
    };

    // Set agent status to regeneration status (worker will pick it up)
    const { error: updateError } = await (supabase
      .from('agents') as any)
      .update({ 
        status: statusMap[stage],
        // Store regeneration metadata in a way the worker can access
        // We'll use a simple approach: status indicates regeneration
      })
      .eq('id', agentId);

    if (updateError) {
      console.error('[api/context/regenerate] Error updating agent:', updateError);
      return NextResponse.json(
        { ok: false, error: `Failed to trigger regeneration: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agent_id: agentId,
      blueprint_id: blueprintId,
      event_id: eventId,
      stage: stage,
      status: statusMap[stage],
      message: `Regeneration of ${stage} stage started. The worker will process this shortly.`,
    });
  } catch (error: any) {
    console.error('[api/context/regenerate] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
