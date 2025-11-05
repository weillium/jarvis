import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Regenerate Blueprint API Route
 * 
 * Deletes the current blueprint and triggers generation of a new one
 * by setting agent status back to 'blueprint_generating'.
 * 
 * POST /api/context/[eventId]/blueprint/regenerate
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
      .select('id, status, stage')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/context/blueprint/regenerate] Error fetching agent:', agentError);
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

    // Verify agent is in a state that allows regeneration
    // Allow regeneration if status is 'idle' with 'blueprint' stage
    const agent = agents[0];
    if (!(agent.status === 'idle' && agent.stage === 'blueprint')) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `Cannot regenerate blueprint. Agent status is '${agent.status}' with stage '${agent.stage}'. Can only regenerate when status is 'idle' with stage 'blueprint'.` 
        },
        { status: 400 }
      );
    }

    // Delete existing blueprints for this agent
    const { error: deleteError } = await (supabase
      .from('context_blueprints') as any)
      .delete()
      .eq('agent_id', agentId);

    if (deleteError) {
      console.error('[api/context/blueprint/regenerate] Error deleting blueprints:', deleteError);
      // Continue anyway - might not have blueprints
    }

    // Set agent status back to 'idle' with 'blueprint' stage to trigger new generation
    const { error: updateError } = await (supabase
      .from('agents') as any)
      .update({ status: 'idle', stage: 'blueprint' })
      .eq('id', agentId);

    if (updateError) {
      console.error('[api/context/blueprint/regenerate] Error updating agent:', updateError);
      return NextResponse.json(
        { ok: false, error: `Failed to trigger regeneration: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agent_id: agentId,
      event_id: eventId,
      status: 'idle',
      stage: 'blueprint',
      message: 'Blueprint regeneration started. A new blueprint will be generated shortly.',
    });
  } catch (error: any) {
    console.error('[api/context/blueprint/regenerate] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
