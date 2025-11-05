import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { connectionManager } from './connection-manager';

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
 * - {"type": "agent_session_status", "payload": {...}, "timestamp": "..."}
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

      // Register this connection with the connection manager
      connectionManager.register(eventId, controller);

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

      // Send initial session statuses (if any exist)
      try {
        const { data: sessions } = await supabase
          .from('agent_sessions')
          .select('*')
          .eq('event_id', eventId)
          .order('created_at', { ascending: true });

        if (sessions && sessions.length > 0) {
          console.log(`[api/stream] Sending initial ${sessions.length} session(s) for event ${eventId}`);
          // Send immediately without delay for better responsiveness
          for (const session of sessions) {
            try {
              controller.enqueue(
                encoder.encode(
                  formatSSE({
                    type: 'agent_session_status',
                    event_id: eventId,
                    timestamp: new Date().toISOString(),
                    payload: {
                      agent_type: session.agent_type,
                      session_id: session.provider_session_id || session.id,
                      status: session.status, // Can be 'active', 'paused', 'closed', 'error'
                      metadata: {
                        created_at: session.created_at,
                        updated_at: session.updated_at,
                        closed_at: session.closed_at,
                        model: session.model || undefined,
                      },
                    },
                  })
                )
              );
              console.log(`[api/stream] Sent initial session ${session.agent_type}: ${session.status}`);
            } catch (error) {
              console.error(`[api/stream] Error sending initial session ${session.agent_type}: ${error}`);
            }
          }
        } else {
          console.log(`[api/stream] No existing sessions for event ${eventId}`);
        }
      } catch (error: any) {
        console.error(`[api/stream] Error fetching initial sessions: ${error.message}`);
        // Don't fail the connection if initial fetch fails
      }

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

      // Subscribe to agent_sessions table for status updates
      const sessionsChannel = supabase
        .channel(`agent_sessions_${eventId}_${Date.now()}`) // Add timestamp to prevent channel conflicts
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'agent_sessions',
            filter: `event_id=eq.${eventId}`,
          },
          async (payload: any) => {
            const session = payload.new || payload.old;
            
            // Only process if we have a valid session
            if (!session || !session.agent_type) {
              console.warn(`[api/stream] Invalid session payload:`, payload);
              return;
            }
            
            console.log(`[api/stream] Session ${payload.eventType} for ${session.agent_type}: ${session.status} (event: ${eventId})`);
            
            // Stream basic status update
            // Note: Comprehensive status (with token metrics, logs, etc.) will be
            // pushed by worker via separate mechanism in Step 7
            try {
              // Create a fresh payload object to ensure React detects the change
              // Use the actual updated_at from the database to ensure React detects status changes
              const statusPayload = {
                agent_type: session.agent_type,
                session_id: session.provider_session_id || session.id,
                status: session.status,
                metadata: {
                  created_at: session.created_at,
                  updated_at: session.updated_at || session.created_at || new Date().toISOString(),
                  closed_at: session.closed_at,
                  model: session.model || undefined,
                },
              };
              
              const message = formatSSE({
                type: 'agent_session_status',
                event_id: eventId,
                timestamp: new Date().toISOString(),
                payload: statusPayload,
              });
              
              controller.enqueue(encoder.encode(message));
              
              console.log(`[api/stream] Successfully sent ${session.agent_type} status update: ${session.status} to SSE stream`);
            } catch (error) {
              console.error(`[api/stream] Error sending session status: ${error}`);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[api/stream] agent_sessions channel subscribed successfully for event ${eventId}`);
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`[api/stream] agent_sessions channel subscription error for event ${eventId}`);
          } else {
            console.log(`[api/stream] agent_sessions channel subscription status: ${status} for event ${eventId}`);
          }
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
          // Client disconnected - cleanup will be handled by abort handler
          clearInterval(heartbeatInterval);
        }
      }, 30000); // Every 30 seconds

      // Handle client disconnect - single consolidated cleanup handler
      req.signal.addEventListener('abort', () => {
        console.log(`[api/stream] Client disconnected for event ${eventId}`);
        
        // Clear heartbeat interval first
        clearInterval(heartbeatInterval);
        
        // Unregister from connection manager
        connectionManager.unregister(eventId, controller);
        
        // Clean up Supabase channels
        supabase.removeChannel(cardsChannel);
        supabase.removeChannel(factsChannel);
        supabase.removeChannel(sessionsChannel);
        
        // Close controller
        controller.close();
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

