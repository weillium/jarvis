import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Confirm Ready - Stop current sessions, regenerate, set agent to ready
 * POST /api/agent-sessions/[eventId]/confirm-ready
 * 
 * This endpoint:
 * 1. Stops and deletes current active sessions
 * 2. Creates new sessions with 'generated' status
 * 3. Updates agent status to 'ready' (not 'running')
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get the agent for this event (must be in active status with testing stage)
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status, stage')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .eq('stage', 'testing')
      .limit(1);

    if (agentError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No agent found with testing stage for this event',
        },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Step 1: Stop and delete all existing sessions (active, paused, generated, etc.)
    const { data: existingSessions, error: sessionsCheckError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .eq('agent_id', agentId);

    if (sessionsCheckError) {
      return NextResponse.json(
        { ok: false, error: `Failed to check existing sessions: ${sessionsCheckError.message}` },
        { status: 500 }
      );
    }

    if (existingSessions && existingSessions.length > 0) {
      // Delete all sessions (worker will handle closing active ones if needed)
      const { error: deleteError } = await supabase
        .from('agent_sessions')
        .delete()
        .eq('event_id', eventId)
        .eq('agent_id', agentId);

      if (deleteError) {
        return NextResponse.json(
          { ok: false, error: `Failed to delete existing sessions: ${deleteError.message}` },
          { status: 500 }
        );
      }
    }

    // Step 2: Agent sessions MUST use the Realtime API model, not the agent's model
    // The agent's model is for text generation (e.g., gpt-4o-mini), but sessions need Realtime API
    // Use environment variable or default to the correct Realtime API model
    // This matches the worker's REALTIME_MODEL configuration
    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
    
    console.log(`[api/agent-sessions/confirm-ready] Using Realtime model: ${model} for event ${eventId}`);

    // Step 3: Create new sessions with 'closed' status (will be updated to 'active' when started)
    const { data: newSessions, error: createError } = await supabase
      .from('agent_sessions')
      .insert([
        {
          event_id: eventId,
          agent_id: agentId,
          provider_session_id: 'pending',
          agent_type: 'cards',
          status: 'closed', // Will be updated to 'active' when started
          model: model,
        },
        {
          event_id: eventId,
          agent_id: agentId,
          provider_session_id: 'pending',
          agent_type: 'facts',
          status: 'closed', // Will be updated to 'active' when started
          model: model,
        },
      ])
      .select();

    if (createError) {
      return NextResponse.json(
        { ok: false, error: `Failed to create new sessions: ${createError.message}` },
        { status: 500 }
      );
    }

    // Step 4: Update agent status to 'active' with 'running' stage (ready for production)
    const { error: updateError } = await supabase
      .from('agents')
      .update({ status: 'active', stage: 'running' })
      .eq('id', agentId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update agent status: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Sessions regenerated and agent set to ready. Ready for production use.',
      eventId,
      agentId,
      sessions: newSessions,
    });
  } catch (error: any) {
    console.error('Error confirming ready:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

