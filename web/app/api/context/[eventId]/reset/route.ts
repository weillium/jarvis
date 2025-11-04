import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Reset Context API Route
 * 
 * Invalidates all existing context components by setting agent status back to 'idle',
 * requiring the user to restart context building. Does not delete actual records
 * from the database to maintain proper versioning and audit trail.
 * 
 * POST /api/context/[eventId]/reset
 */

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Find agent for this event
    const { data: agents, error: agentError } = await (supabase
      .from('agents') as any)
      .select('id, status')
      .eq('event_id', eventId)
      .limit(1);

    if (agentError) {
      console.error('[api/context/reset] Error fetching agent:', agentError);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No agent found for this event' },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Reset agent status to 'idle' to invalidate all context components
    // This forces a restart of context building without deleting any records
    const { error: updateError } = await (supabase
      .from('agents') as any)
      .update({ status: 'idle' })
      .eq('id', agentId);

    if (updateError) {
      console.error('[api/context/reset] Error updating agent:', updateError);
      return NextResponse.json(
        { ok: false, error: `Failed to reset context: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agent_id: agentId,
      event_id: eventId,
      status: 'idle',
      message: 'Context components have been invalidated. Please restart context building.',
    });
  } catch (error: any) {
    console.error('[api/context/reset] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

