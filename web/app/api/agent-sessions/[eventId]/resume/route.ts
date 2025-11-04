import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Resume paused agent sessions for an event
 * POST /api/agent-sessions/[eventId]/resume
 * 
 * Resumes paused sessions by recreating WebSocket connections
 * and restoring from preserved runtime state.
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

    // Get the agent for this event
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status')
      .eq('event_id', eventId)
      .in('status', ['running', 'context_complete'])
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
          error: 'No agent found for this event',
        },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Check if sessions are paused
    const { data: pausedSessions, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .eq('status', 'paused');

    if (sessionsError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    if (!pausedSessions || pausedSessions.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No paused sessions found to resume',
        },
        { status: 404 }
      );
    }

    // Mark event as live if not already (required for worker to resume)
    const { error: eventUpdateError } = await supabase
      .from('events')
      .update({ is_live: true })
      .eq('id', eventId);

    if (eventUpdateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to mark event as live: ${eventUpdateError.message}` },
        { status: 500 }
      );
    }

    // Update agent status to running (worker will resume sessions)
    // Keep sessions as 'paused' - worker's tickPauseResume will detect them and call resumeEvent()
    const { error: agentUpdateError } = await supabase
      .from('agents')
      .update({ status: 'running' })
      .eq('id', agentId);

    if (agentUpdateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update agent status: ${agentUpdateError.message}` },
        { status: 500 }
      );
    }

    // Don't update session status here - keep as 'paused'
    // The worker's tickPauseResume will detect paused sessions where:
    // - event is live (we just ensured this)
    // - agent status is running (we just set this)
    // and will call resumeEvent() which will update status to 'active'

    return NextResponse.json({
      ok: true,
      message: 'Sessions will be resumed by worker on next tick.',
      eventId,
      agentId,
      resumedSessions: pausedSessions.length,
    });
  } catch (error: any) {
    console.error('Error resuming agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

