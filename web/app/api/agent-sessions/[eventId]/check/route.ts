import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AgentType = 'transcript' | 'cards' | 'facts';
type AgentTransport = 'realtime' | 'stateless';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Check if agent sessions exist and their status
 * 
 * GET /api/agent-sessions/[eventId]/check
 * 
 * Returns: { 
 *   ok: boolean, 
 *   hasSessions: boolean,  // True if any sessions exist (for display)
 *   hasActiveSessions: boolean,  // True only if sessions are starting/active (for SSE connection)
 *   sessions: [...],  // All sessions with their data
 * }
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

    // Fetch all sessions (any status) for display purposes
    // SSE connection will only be established when sessions are starting/active
    console.log(`[api/agent-sessions/check] Fetching sessions for event_id: ${eventId}`);
    const { data: sessions, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status, transport, provider_session_id, created_at, updated_at, closed_at, model, connection_count, last_connected_at, token_metrics, runtime_stats, metrics_recorded_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (sessionsError) {
      console.error('[api/agent-sessions/check] Error fetching sessions:', sessionsError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    console.log(`[api/agent-sessions/check] Found ${sessions?.length || 0} sessions for event ${eventId}:`, 
      sessions?.map(s => ({ id: s.id, agent_type: s.agent_type, status: s.status })) || []);

    const hasSessions = sessions && sessions.length > 0;
    // Only consider sessions as "active" if they're in starting/active status (for SSE connection)
    // SSE should only connect when sessions are actively processing content, not when paused
    const activeSessions = sessions?.filter(s => s.status === 'active') || [];
    const hasActiveSessions = activeSessions.length > 0;

    const transformedSessions = sessions?.map(s => {
      const agentType = s.agent_type as AgentType;
      const transport = (s.transport as AgentTransport | null | undefined) ?? 'stateless';

      return {
        agent_type: agentType,
        transport,
        session_id: s.provider_session_id || s.id,
        status: s.status,
        metadata: {
          created_at: s.created_at,
          updated_at: s.updated_at,
          closed_at: s.closed_at,
          model: s.model || undefined,
          connection_count: s.connection_count || 0,
          last_connected_at: s.last_connected_at || null,
        },
        token_metrics: s.token_metrics || undefined,
        runtime_stats: s.runtime_stats || undefined,
        metrics_recorded_at: s.metrics_recorded_at || undefined,
      };
    }) || [];

    console.log(`[api/agent-sessions/check] Returning ${transformedSessions.length} transformed sessions`);

    const response = {
      ok: true,
      hasSessions, // True if any sessions exist (for display)
      hasActiveSessions, // True only if sessions are starting/active (for SSE connection - only when actively processing)
      sessionCount: sessions?.length || 0,
      activeSessionCount: activeSessions.length,
      sessions: transformedSessions,
    };

    console.log(`[api/agent-sessions/check] Response:`, {
      ok: response.ok,
      hasSessions: response.hasSessions,
      sessionCount: response.sessionCount,
      sessionsLength: response.sessions.length,
    });

    return NextResponse.json(response);
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

