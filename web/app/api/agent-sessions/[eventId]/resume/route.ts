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

    // Get the agent for this event (can be running or context_complete)
    // Try active + running first, then idle + context_complete
    let { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status, stage')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .eq('stage', 'running')
      .limit(1);
    
    if (!agents || agents.length === 0) {
      const { data: agents2, error: error2 } = await supabase
        .from('agents')
        .select('id, status, stage')
        .eq('event_id', eventId)
        .eq('status', 'idle')
        .eq('stage', 'context_complete')
        .limit(1);
      
      if (error2) {
        agentError = error2;
      } else {
        agents = agents2;
      }
    }

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

    // Check if sessions are paused or closed (can resume both)
    const { data: sessionsToResume, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .in('status', ['paused', 'closed']);

    if (sessionsError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    if (!sessionsToResume || sessionsToResume.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No paused or closed sessions found to resume',
        },
        { status: 404 }
      );
    }

    // Update agent status to active with running stage (worker will resume sessions)
    // Keep sessions as 'paused' - worker's tickPauseResume will detect them and call resumeEvent()
    const { error: agentUpdateError } = await supabase
      .from('agents')
      .update({ status: 'active', stage: 'running' })
      .eq('id', agentId);

    if (agentUpdateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update agent status: ${agentUpdateError.message}` },
        { status: 500 }
      );
    }

    // Update session status from 'paused' or 'closed' to 'active' so worker can resume
    const { error: sessionsUpdateError } = await supabase
      .from('agent_sessions')
      .update({ status: 'active' })
      .eq('event_id', eventId)
      .in('status', ['paused', 'closed']);

    if (sessionsUpdateError) {
      console.warn(`Failed to update session status: ${sessionsUpdateError.message}`);
    }

    // The worker's tickPauseResume or tickRun will detect these sessions and resume them

    return NextResponse.json({
      ok: true,
      message: 'Sessions will be resumed by worker on next tick.',
      eventId,
      agentId,
      resumedSessions: sessionsToResume.length,
    });
  } catch (error: any) {
    console.error('Error resuming agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

