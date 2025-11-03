import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-Sent Events (SSE) Stream API Route
 * 
 * Streams live cards and facts updates to the frontend.
 * Subscribes to agent_outputs and facts tables via Supabase Realtime.
 * 
 * GET /api/stream?event_id=<uuid>
 * 
 * Returns SSE stream with events:
 * - {"type": "connected", "timestamp": "..."}
 * - {"type": "card", "payload": {...}, "timestamp": "..."}
 * - {"type": "fact_update", "payload": {...}, "timestamp": "..."}
 */

// Create Supabase client with service role for privileged operations
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Format SSE message
function formatSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get('event_id');

  if (!eventId) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing event_id query parameter' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Validate UUID format
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

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const supabase = getSupabaseClient();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(
          formatSSE({
            type: 'connected',
            event_id: eventId,
            timestamp: new Date().toISOString(),
          })
        )
      );

      // Subscribe to agent_outputs table for cards
      const cardsChannel = supabase
        .channel(`agent_outputs_${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'agent_outputs',
            filter: `event_id=eq.${eventId}`,
          },
          (payload: any) => {
            const output = payload.new;
            
            // Only stream cards (not facts updates)
            if (output.agent_type === 'cards' && output.type === 'card') {
              controller.enqueue(
                encoder.encode(
                  formatSSE({
                    type: 'card',
                    payload: output.payload,
                    for_seq: output.for_seq,
                    created_at: output.created_at,
                    timestamp: new Date().toISOString(),
                  })
                )
              );
            }
          }
        )
        .subscribe();

      // Subscribe to facts table for fact updates
      const factsChannel = supabase
        .channel(`facts_${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'facts',
            filter: `event_id=eq.${eventId}`,
          },
          (payload: any) => {
            controller.enqueue(
              encoder.encode(
                formatSSE({
                  type: 'fact_update',
                  event: payload.eventType, // INSERT, UPDATE, DELETE
                  payload: payload.new || payload.old,
                  timestamp: new Date().toISOString(),
                })
              )
            );
          }
        )
        .subscribe();

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        console.log(`[api/stream] Client disconnected for event ${eventId}`);
        supabase.removeChannel(cardsChannel);
        supabase.removeChannel(factsChannel);
        controller.close();
      });

      // Send periodic heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              formatSSE({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
              })
            )
          );
        } catch (error) {
          // Client disconnected
          clearInterval(heartbeatInterval);
          supabase.removeChannel(cardsChannel);
          supabase.removeChannel(factsChannel);
        }
      }, 30000); // Every 30 seconds

      // Cleanup on stream end
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    },
  });
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

