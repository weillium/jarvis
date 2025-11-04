import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Reset Context API Route
 * 
 * Invalidates all existing context components by:
 * 1. Setting is_active = false for all glossary terms, context items, and research results
 * 2. Setting agent status back to 'idle' to require restart of context building
 * 
 * Does not delete actual records from the database to maintain proper versioning and audit trail.
 * All invalidated items are marked with deleted_at timestamp.
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

    // Invalidate all context components by setting is_active = false
    // This marks them as superseded/invalidated without deleting records
    const [glossaryResult, contextItemsResult, researchResult, agentUpdateResult] = await Promise.all([
      // Invalidate all glossary terms for this event
      (supabase.from('glossary_terms') as any)
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('is_active', true),
      
      // Invalidate all context items for this event
      (supabase.from('context_items') as any)
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('is_active', true),
      
      // Invalidate all research results for this event
      (supabase.from('research_results') as any)
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('is_active', true),
      
      // Reset agent status to 'idle' to require restart of context building
      (supabase.from('agents') as any)
        .update({ status: 'idle' })
        .eq('id', agentId),
    ]);

    // Log errors but don't fail if some tables don't have records
    if (glossaryResult.error) {
      console.warn('[api/context/reset] Warning: Failed to invalidate glossary terms:', glossaryResult.error.message);
    }
    if (contextItemsResult.error) {
      console.warn('[api/context/reset] Warning: Failed to invalidate context items:', contextItemsResult.error.message);
    }
    if (researchResult.error) {
      console.warn('[api/context/reset] Warning: Failed to invalidate research results:', researchResult.error.message);
    }
    if (agentUpdateResult.error) {
      console.error('[api/context/reset] Error updating agent:', agentUpdateResult.error);
      return NextResponse.json(
        { ok: false, error: `Failed to reset context: ${agentUpdateResult.error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      agent_id: agentId,
      event_id: eventId,
      status: 'idle',
      message: 'All context components have been invalidated. Please restart context building.',
    });
  } catch (error: any) {
    console.error('[api/context/reset] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

