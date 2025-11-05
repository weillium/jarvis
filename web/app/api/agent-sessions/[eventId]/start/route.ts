import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get the agent for this event (must be in active status with testing or running stage)
    // Testing: for new sessions or testing workflow
    // Running: for resuming paused sessions
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status, stage')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .in('stage', ['testing', 'running'])
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
          error: 'No agent found with testing or running status for this event. Create sessions first.',
        },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Check for sessions that can be started: 'closed' (new sessions) or 'paused' (resume)
    const { data: sessionsToStart, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status, created_at')
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .in('status', ['closed', 'paused']);

    if (sessionsError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    if (!sessionsToStart || sessionsToStart.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No closed or paused sessions found. Create sessions first.',
        },
        { status: 404 }
      );
    }

    // Filter closed sessions to only include new ones (created in last minute)
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const newClosedSessions = sessionsToStart.filter(s => 
      s.status === 'closed' && s.created_at && s.created_at >= oneMinuteAgo
    );
    const pausedCount = sessionsToStart.filter(s => s.status === 'paused').length;

    if (newClosedSessions.length === 0 && pausedCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No new sessions (created in last minute) or paused sessions found. Create new sessions first.',
        },
        { status: 404 }
      );
    }

    // Update sessions to 'active' - worker will pick them up and connect
    const { error: updateError } = await supabase
      .from('agent_sessions')
      .update({ status: 'active' })
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .in('id', [...newClosedSessions.map(s => s.id), ...sessionsToStart.filter(s => s.status === 'paused').map(s => s.id)]);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update sessions: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Note: Worker will pick up sessions with 'active' status and connect them
    // The worker's startEvent will handle:
    // - New sessions: create connections from 'closed' → 'active'
    // - Paused sessions: resume connections from 'paused' → 'active'

    return NextResponse.json({
      ok: true,
      message: pausedCount > 0 
        ? `Sessions will be resumed by worker. ${pausedCount} paused session(s) updated to active.`
        : `Sessions will be started by worker. ${newClosedSessions.length} new session(s) updated to active.`,
      eventId,
      agentId,
      sessionsUpdated: sessionsToStart.length,
      newSessionsCount: newClosedSessions.length,
      pausedCount,
    });
  } catch (error: any) {
    console.error('Error starting agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

