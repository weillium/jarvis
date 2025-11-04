import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Blueprint API Routes
 * 
 * GET /api/context/[eventId]/blueprint - Get blueprint for event
 * POST /api/context/[eventId]/blueprint - Approve blueprint
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

// GET - Fetch blueprint
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

    // Find agent for this event
    const { data: agents, error: agentError } = await (supabase
      .from('agents') as any)
      .select('id')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/context/blueprint] Error fetching agent:', agentError);
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

    // Fetch blueprint for this agent
    const { data: blueprint, error: blueprintError } = await (supabase
      .from('context_blueprints') as any)
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (blueprintError) {
      // Blueprint not found is not an error - just return null
      if (blueprintError.code === 'PGRST116') {
        return NextResponse.json({
          ok: true,
          blueprint: null,
          message: 'No blueprint found for this event',
        });
      }

      console.error('[api/context/blueprint] Error fetching blueprint:', blueprintError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch blueprint: ${blueprintError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      blueprint: blueprint,
    });
  } catch (error: any) {
    console.error('[api/context/blueprint] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Approve blueprint
export async function POST(
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

    // Find agent for this event
    const { data: agents, error: agentError } = await (supabase
      .from('agents') as any)
      .select('id, status')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/context/blueprint] Error fetching agent:', agentError);
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

    // Verify agent is in correct state
    if (agents[0].status !== 'blueprint_ready') {
      return NextResponse.json(
        { 
          ok: false, 
          error: `Cannot approve blueprint. Agent status is '${agents[0].status}'. Expected 'blueprint_ready'.` 
        },
        { status: 400 }
      );
    }

    // Find blueprint with status 'ready'
    const { data: blueprint, error: blueprintError } = await (supabase
      .from('context_blueprints') as any)
      .select('id, status')
      .eq('agent_id', agentId)
      .eq('status', 'ready')
      .limit(1)
      .single();

    if (blueprintError || !blueprint) {
      console.error('[api/context/blueprint] Error fetching blueprint:', blueprintError);
      return NextResponse.json(
        { ok: false, error: 'No ready blueprint found for this event' },
        { status: 404 }
      );
    }

    // Update blueprint status to 'approved'
    const { error: updateBlueprintError } = await (supabase
      .from('context_blueprints') as any)
      .update({ 
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('id', blueprint.id);

    if (updateBlueprintError) {
      console.error('[api/context/blueprint] Error updating blueprint:', updateBlueprintError);
      return NextResponse.json(
        { ok: false, error: `Failed to approve blueprint: ${updateBlueprintError.message}` },
        { status: 500 }
      );
    }

    // Update agent status to 'blueprint_approved'
    const { error: updateAgentError } = await (supabase
      .from('agents') as any)
      .update({ status: 'blueprint_approved' })
      .eq('id', agentId);

    if (updateAgentError) {
      console.error('[api/context/blueprint] Error updating agent:', updateAgentError);
      // Try to rollback blueprint status
      await (supabase
        .from('context_blueprints') as any)
        .update({ status: 'ready' })
        .eq('id', blueprint.id);
      
      return NextResponse.json(
        { ok: false, error: `Failed to update agent status: ${updateAgentError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      blueprint_id: blueprint.id,
      agent_id: agentId,
      message: 'Blueprint approved. Context generation will start shortly.',
    });
  } catch (error: any) {
    console.error('[api/context/blueprint] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
