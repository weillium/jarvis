import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type AgentType = 'transcript' | 'cards' | 'facts';
type AgentTransport = 'realtime' | 'stateless';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Get historical agent sessions from agent_sessions_history table
 * 
 * GET /api/agent-sessions/[eventId]/history
 * 
 * Returns: { 
 *   ok: boolean, 
 *   sessions: [...],  // All historical session records with their data
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

    // Fetch all historical session records for this event
    // We want to get unique sessions, so we'll group by agent_session_id and get the latest entry for each
    // Or we can get all entries and let the frontend handle deduplication
    console.log(`[api/agent-sessions/history] Fetching historical sessions for event_id: ${eventId}`);
    
    const { data: historyRecords, error: historyError } = await supabase
      .from('agent_sessions_history')
      .select(`
        id,
        agent_session_id,
        event_id,
        agent_id,
        agent_type,
        transport,
        status,
        event_type,
        previous_status,
        new_status,
        provider_session_id,
        model,
        connection_count,
        last_connected_at,
        token_metrics,
        runtime_stats,
        metrics_recorded_at,
        session_created_at,
        session_updated_at,
        session_closed_at,
        created_at
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (historyError) {
      console.error('[api/agent-sessions/history] Error fetching history:', historyError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch session history: ${historyError.message}` },
        { status: 500 }
      );
    }

    console.log(`[api/agent-sessions/history] Found ${historyRecords?.length || 0} history records for event ${eventId}`);

    // Transform all history records (no deduplication - we need all for timeline)
    const transformedRecords = (historyRecords || []).map(record => {
      const agentType = record.agent_type as AgentType;
      const transport = (record.transport as AgentTransport | null | undefined) ?? 'stateless';

      return {
        agent_type: agentType,
        transport,
        agent_id: record.agent_id,
        agent_session_id: record.agent_session_id,
        session_id: record.provider_session_id || record.agent_session_id || record.id,
        status: record.status || 'closed',
        metadata: {
          created_at: record.session_created_at || record.created_at,
          updated_at: record.session_updated_at || record.created_at,
          closed_at: record.session_closed_at || null,
          model: record.model || undefined,
          connection_count: record.connection_count || 0,
          last_connected_at: record.last_connected_at || null,
        },
        token_metrics: record.token_metrics || undefined,
        runtime_stats: record.runtime_stats || undefined,
        metrics_recorded_at: record.metrics_recorded_at || undefined,
        history_id: record.id,
        event_type: record.event_type,
        history_created_at: record.created_at,
        previous_status: record.previous_status || null,
        new_status: record.new_status || null,
      };
    });

    console.log(`[api/agent-sessions/history] Returning ${transformedRecords.length} history records`);

    const response = {
      ok: true,
      records: transformedRecords,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[api/agent-sessions/history] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch session history' },
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

