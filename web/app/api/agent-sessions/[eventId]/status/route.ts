import { NextRequest } from 'next/server';
import { connectionManager } from '../../../stream/connection-manager';

/**
 * Worker-to-SSE Push Endpoint
 * 
 * Allows the worker to push comprehensive agent session status updates
 * directly to active SSE connections.
 * 
 * POST /api/agent-sessions/[eventId]/status
 * 
 * Body: AgentSessionStatus object
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const status = await req.json();

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid event_id format (must be UUID)' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate status payload
    if (!status || !status.agent_type) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid status payload: missing agent_type' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Push status to all active SSE connections for this event
    connectionManager.pushStatus(eventId, status);

    return new Response(
      JSON.stringify({
        ok: true,
        connections: connectionManager.getConnectionCount(eventId),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[api/agent-sessions/status] Error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || 'Failed to push status',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

