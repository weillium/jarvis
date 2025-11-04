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

    // Get the agent for this event
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('status', 'context_complete')
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
          error: 'No agent found with context_complete status for this event',
        },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Mark event as live (this will trigger the worker to start sessions)
    // Note: We keep agent status as 'context_complete' - the worker's tickRun() looks for
    // agents with 'context_complete' status and will start the sessions, then update status to 'running'
    const { error: updateError } = await supabase
      .from('events')
      .update({ is_live: true })
      .eq('id', eventId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Failed to mark event as live: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Event marked as live. Sessions will start automatically.',
      eventId,
      agentId,
    });
  } catch (error: any) {
    console.error('Error starting agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

