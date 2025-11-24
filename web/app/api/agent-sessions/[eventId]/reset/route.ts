import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3001';

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

    try {
      const workerResponse = await fetch(`${WORKER_URL}/sessions/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
        signal: AbortSignal.timeout(15000), // Increase to 15 seconds for worker operations
      });

      let workerData: any = null;
      try {
        workerData = await workerResponse.json();
      } catch (_error) {
        // Ignore JSON parse failure; handled below
      }

      if (!workerResponse.ok || !workerData?.ok) {
        const workerError = workerData?.error || `Worker responded with status ${workerResponse.status}`;
        return NextResponse.json(
          { ok: false, error: `Worker reset failed: ${workerError}` },
          { status: workerResponse.status >= 400 ? workerResponse.status : 502 }
        );
      }
    } catch (workerError: any) {
      if (workerError?.name === 'TimeoutError') {
        return NextResponse.json(
          { ok: false, error: 'Worker timed out while resetting runtime' },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { ok: false, error: workerError?.message || 'Failed to reset runtime via worker' },
        { status: 502 }
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

