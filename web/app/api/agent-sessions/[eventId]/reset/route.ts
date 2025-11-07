import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Reset agent sessions for an event
 * Deletes existing agent_sessions rows and reverts agent status/stage
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, status, stage')
      .eq('event_id', eventId)
      .limit(1)
      .maybeSingle();

    if (agentError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    if (!agent) {
      return NextResponse.json(
        { ok: false, error: 'No agent found for this event' },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabase
      .from('agent_sessions')
      .delete()
      .eq('event_id', eventId)
      .eq('agent_id', agent.id);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: `Failed to delete sessions: ${deleteError.message}` },
        { status: 500 }
      );
    }

    const { error: updateAgentError } = await supabase
      .from('agents')
      .update({ status: 'idle', stage: 'context_complete' })
      .eq('id', agent.id);

    if (updateAgentError) {
      return NextResponse.json(
        { ok: false, error: `Failed to reset agent status: ${updateAgentError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: 'Sessions reset successfully.' });
  } catch (error: any) {
    console.error('[api/agent-sessions/reset] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

