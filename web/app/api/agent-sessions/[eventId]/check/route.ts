import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Check if agent sessions exist and are in starting/active states
 * 
 * GET /api/agent-sessions/[eventId]/check
 * 
 * Returns: { ok: boolean, hasActiveSessions: boolean }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Check for sessions with status 'starting' or 'active'
    const { data: sessions, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .in('status', ['starting', 'active']);

    if (sessionsError) {
      console.error('[api/agent-sessions/check] Error fetching sessions:', sessionsError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    const hasActiveSessions = sessions && sessions.length > 0;

    return NextResponse.json({
      ok: true,
      hasActiveSessions,
      sessionCount: sessions?.length || 0,
    });
  } catch (error: any) {
    console.error('[api/agent-sessions/check] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to check sessions' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

