import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Start Context Generation API Route
 * 
 * Initiates context generation by setting agent status to 'blueprint_generating'.
 * The worker will pick this up via tickBlueprint() and generate a blueprint.
 * 
 * POST /api/context/[eventId]/start
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

    // Validate eventId format (basic UUID check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Find the agent for this event
    // Try to find existing agent, or we could create one if needed
    const { data: existingAgents, error: agentError } = await (supabase
      .from('agents') as any)
      .select('id, event_id, status, stage')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/context/start] Error fetching agent:', agentError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    let agentId: string;

    if (existingAgents && existingAgents.length > 0) {
      // Agent exists, check if we can start blueprint generation
      const agent = existingAgents[0];
      
      // Only allow starting if agent is in a valid state (idle with no stage, or idle with blueprint stage, or error)
      const isValidState = 
        (agent.status === 'idle' && (agent.stage === null || agent.stage === 'blueprint')) ||
        agent.status === 'error';
      
      if (!isValidState) {
        return NextResponse.json(
          { 
            ok: false, 
            error: `Cannot start blueprint generation. Agent status is '${agent.status}' with stage '${agent.stage}'. Valid states: idle (no stage or blueprint stage) or error` 
          },
          { status: 400 }
        );
      }

      agentId = agent.id;

      // Update agent status to 'idle' with 'blueprint' stage
      const { error: updateError } = await (supabase
        .from('agents') as any)
        .update({ status: 'idle', stage: 'blueprint' })
        .eq('id', agentId);

      if (updateError) {
        console.error('[api/context/start] Error updating agent:', updateError);
        return NextResponse.json(
          { ok: false, error: `Failed to update agent status: ${updateError.message}` },
          { status: 500 }
        );
      }
    } else {
      // No agent exists, we need event info to create one
      // For now, return error - agents should be created via Edge Function
      return NextResponse.json(
        { 
          ok: false, 
          error: 'No agent found for this event. Agents must be created via the orchestrator Edge Function.' 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      agent_id: agentId,
      event_id: eventId,
      status: 'idle',
      stage: 'blueprint',
      message: 'Context generation started. Blueprint will be generated shortly.',
    });
  } catch (error: any) {
    console.error('[api/context/start] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
