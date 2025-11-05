import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Worker HTTP server URL (defaults to localhost:3001)
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3001';

/**
 * GET /api/agent-sessions/[eventId]/websocket-state
 * 
 * Returns the actual WebSocket connection state directly from the worker.
 * This endpoint queries the worker's HTTP server for real-time WebSocket state.
 * 
 * The worker exposes this via HTTP GET /websocket-state?event_id=<eventId>
 * which queries the orchestrator's runtime state directly.
 * 
 * Falls back to database status if worker is unavailable.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    
    // Try to query worker directly first
    try {
      const workerResponse = await fetch(`${WORKER_URL}/websocket-state?event_id=${eventId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      if (workerResponse.ok) {
        const workerData = await workerResponse.json();
        
        if (workerData.ok && workerData.runtime_exists) {
          // Worker has direct connection state
          return NextResponse.json({
            ok: true,
            source: 'worker_direct',
            event_id: eventId,
            runtime_status: workerData.runtime_status,
            sessions: workerData.sessions.map((s: any) => ({
              agent_type: s.agent_type,
              session_id: s.session_id || 'pending',
              websocket_state: s.websocket_state, // Actual WebSocket readyState from worker
              is_active: s.is_active, // Worker's internal isActive flag
              queue_length: s.queue_length,
              connection_url: s.connection_url, // Full WebSocket connection URL
              connected_at: s.connected_at, // ISO timestamp when connection was established
              connection_info: s.connection_info, // Parsed connection details
              ping_pong: s.ping_pong, // Ping-pong health status
              // Note: Database status may differ from actual WebSocket state
            })),
          });
        } else {
          // Worker responded but runtime doesn't exist
          return NextResponse.json({
            ok: true,
            source: 'worker_direct',
            event_id: eventId,
            runtime_exists: false,
            sessions: [],
            note: 'Worker is running but no runtime exists for this event. Sessions may not be started yet.',
          });
        }
      }
    } catch (workerError: any) {
      // Worker is unavailable or error occurred
      console.warn('[api/agent-sessions/websocket-state] Worker unavailable:', workerError.message);
      
      // Fall back to database status
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });

      const { data: sessions, error: sessionsError } = await supabase
        .from('agent_sessions')
        .select('id, agent_type, status, provider_session_id, created_at, updated_at, closed_at, model')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (sessionsError) {
        console.error('[api/agent-sessions/websocket-state] Error fetching sessions:', sessionsError);
        return NextResponse.json(
          { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        source: 'database_fallback',
        event_id: eventId,
        worker_available: false,
        worker_error: workerError.message,
        sessions: sessions?.map(s => ({
          agent_type: s.agent_type,
          session_id: s.provider_session_id || s.id,
          status: s.status, // Database status (may lag behind actual WebSocket state)
          websocket_state: null, // Not available from database
          metadata: {
            created_at: s.created_at,
            updated_at: s.updated_at,
            closed_at: s.closed_at,
            model: s.model || undefined,
          },
          note: 'Worker unavailable. Showing database status only. For real-time WebSocket state, ensure worker is running and accessible.',
        })) || [],
      });
    }
    
    // Should not reach here, but fallback just in case
    return NextResponse.json({
      ok: false,
      error: 'Unable to determine WebSocket state',
    }, { status: 500 });
  } catch (error: any) {
    console.error('[api/agent-sessions/websocket-state] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get WebSocket state' },
      { status: 500 }
    );
  }
}

