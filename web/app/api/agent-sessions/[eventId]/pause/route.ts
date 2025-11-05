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

    // Check if sessions are active (this is the primary check)
    // We check sessions first because they're the actual source of truth
    // Agent status can be 'testing' when sessions are active, not necessarily 'running'
    const { data: sessions, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status, agent_id')
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

    // Update session status to 'paused' - this affects agent_sessions directly, NOT the agent status
    // The worker will detect the status change and close WebSocket connections on next tick
    // Agent status remains unchanged (e.g., stays as 'testing' or 'running')
    const { error: updateError } = await supabase
      .from('agent_sessions')
      .update({ status: 'paused' })
      .eq('event_id', eventId)
      .in('status', ['starting', 'active']);

    if (updateError) {
      // Check if it's a constraint violation (migration not applied)
      if (updateError.message?.includes('check constraint') || updateError.message?.includes('agent_sessions_status_check')) {
        return NextResponse.json(
          { 
            ok: false, 
            error: `Database migration not applied. Please run migration 20251104184719_add_paused_status_to_agent_sessions.sql to add 'paused' status support.`,
            details: updateError.message 
          },
          { status: 500 }
        );
      }
      
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

