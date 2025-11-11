import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';
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

  // Check authentication and event ownership
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Not authenticated' 
      }),
      {
        status: 401,
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

      // Initial session data is provided by React Query, not SSE
      // SSE only streams real-time enrichment data (connection health, logs, metrics)
      console.log(`[api/stream] SSE connection established for event ${eventId} - waiting for enrichment data from worker`);

      // Subscribe to cards table for canonical state changes
      const cardsChannel = supabase
        .channel(`cards_${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cards',
            filter: `event_id=eq.${eventId}`,
          },
          (payload: any) => {
            const eventType = payload.eventType;
            const newRow = payload.new;
            const oldRow = payload.old;

            const toSnapshot = (row: any) => {
              if (!row || typeof row !== 'object' || typeof row.payload !== 'object') {
                return null;
              }

              return {
                id: row.card_id,
                event_id: row.event_id,
                payload: row.payload,
                card_kind:
                  typeof row.card_kind === 'string'
                    ? row.card_kind
                    : typeof row.payload?.kind === 'string'
                    ? row.payload.kind
                    : null,
                created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
                updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
                last_seen_seq:
                  typeof row.last_seen_seq === 'number' && Number.isFinite(row.last_seen_seq)
                    ? row.last_seen_seq
                    : null,
                is_active: row.is_active !== false,
              };
            };

            if (eventType === 'INSERT') {
              const snapshot = toSnapshot(newRow);
              if (!snapshot) return;
              controller.enqueue(
                encoder.encode(
                  formatSSE({
                    type: 'card_created',
                    timestamp: new Date().toISOString(),
                    card: snapshot,
                  })
                )
              );
              return;
            }

            if (eventType === 'UPDATE') {
              const snapshot = toSnapshot(newRow);
              if (!snapshot) return;

              const wasActive = oldRow ? oldRow.is_active !== false : true;
              const nowInactive = snapshot.is_active === false;

              if (wasActive && nowInactive) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE({
                      type: 'card_deactivated',
                      timestamp: new Date().toISOString(),
                      card_id: snapshot.id,
                    })
                  )
                );
                return;
              }

              controller.enqueue(
                encoder.encode(
                  formatSSE({
                    type: 'card_updated',
                    timestamp: new Date().toISOString(),
                    card: snapshot,
                  })
                )
              );
              return;
            }

            if (eventType === 'DELETE' && oldRow) {
              controller.enqueue(
                encoder.encode(
                  formatSSE({
                    type: 'card_deleted',
                    timestamp: new Date().toISOString(),
                    card_id: oldRow.card_id,
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

      // Session status updates are handled by React Query polling
      // SSE only streams enrichment data from worker (websocket_state, ping_pong, logs, real-time metrics)

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

