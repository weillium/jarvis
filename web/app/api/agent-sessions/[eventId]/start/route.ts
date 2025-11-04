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

    // Get the agent for this event (must be in testing status with generated sessions)
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('status', 'testing')
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
          error: 'No agent found with testing status for this event. Create sessions first.',
        },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Check for generated sessions
    const { data: generatedSessions, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .eq('status', 'generated');

    if (sessionsError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    if (!generatedSessions || generatedSessions.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No generated sessions found. Create sessions first.',
        },
        { status: 404 }
      );
    }

    // Update sessions from 'generated' to 'starting' so worker can activate them
    const { error: updateError } = await supabase
      .from('agent_sessions')
      .update({ status: 'starting' })
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .eq('status', 'generated');

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to update sessions: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Note: Worker will pick up sessions with 'starting' status and activate them
    // The worker's startEvent will handle the actual session creation and connection

    return NextResponse.json({
      ok: true,
      message: 'Sessions will be started by worker. Status updated to starting.',
      eventId,
      agentId,
      sessionsUpdated: generatedSessions.length,
    });
  } catch (error: any) {
    console.error('Error starting agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

