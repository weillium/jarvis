import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Pause agent sessions for an event
 * POST /api/agent-sessions/[eventId]/pause
 * 
 * Pauses both cards and facts sessions by closing WebSocket connections
 * while preserving runtime state (ring buffer, facts store) for resume.
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
      .eq('status', 'running')
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
          error: 'No running agent found for this event',
        },
        { status: 404 }
      );
    }

    // Check if sessions are active
    const { data: sessions, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .in('status', ['starting', 'active']);

    if (sessionsError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No active sessions found to pause',
        },
        { status: 404 }
      );
    }

    // Note: Actual pause happens in the worker via orchestrator.pauseEvent()
    // This endpoint signals the worker to pause. The worker will handle the actual pause.
    // For now, we'll update the status directly (worker should handle this via API call)
    // Actually, we should call the worker or have the worker poll for pause requests
    // For simplicity, let's update status to paused directly (worker will respect this)
    
    // Better approach: Store pause request, worker will check and pause
    // For MVP, we'll update status directly and worker will handle it on next tick
    const { error: updateError } = await supabase
      .from('agent_sessions')
      .update({ status: 'paused' })
      .eq('event_id', eventId)
      .in('status', ['starting', 'active']);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to pause sessions: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Sessions paused. Worker will close WebSocket connections on next tick.',
      eventId,
      pausedSessions: sessions.length,
    });
  } catch (error: any) {
    console.error('Error pausing agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

