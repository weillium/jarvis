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

    // Get the agent for this event (must be in testing or running status)
    // Testing: for new sessions or testing workflow
    // Running: for resuming paused sessions
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status')
      .eq('event_id', eventId)
      .in('status', ['testing', 'running'])
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

    // Check for sessions that can be started: 'generated' (new sessions) or 'paused' (resume)
    const { data: sessionsToStart, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .in('status', ['generated', 'paused']);

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
          error: 'No generated or paused sessions found. Create sessions first.',
        },
        { status: 404 }
      );
    }

    const generatedCount = sessionsToStart.filter(s => s.status === 'generated').length;
    const pausedCount = sessionsToStart.filter(s => s.status === 'paused').length;

    // Update sessions to 'starting' so worker can activate/resume them
    // This handles both 'generated' (new sessions) and 'paused' (resuming sessions)
    const { error: updateError } = await supabase
      .from('agent_sessions')
      .update({ status: 'starting' })
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .in('status', ['generated', 'paused']);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update sessions: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Note: Worker will pick up sessions with 'starting' status and activate/resume them
    // The worker's startEvent will handle:
    // - New sessions: create connections from 'generated' → 'starting' → 'active'
    // - Paused sessions: resume connections from 'paused' → 'starting' → 'active'

    return NextResponse.json({
      ok: true,
      message: pausedCount > 0 
        ? `Sessions will be resumed by worker. ${pausedCount} paused session(s) updated to starting.`
        : `Sessions will be started by worker. ${generatedCount} generated session(s) updated to starting.`,
      eventId,
      agentId,
      sessionsUpdated: sessionsToStart.length,
      generatedCount,
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

