import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Purge Facts API Route
 * 
 * Sets is_active = FALSE for all facts for an event.
 * This marks facts as inactive without deleting them from the database.
 * Facts with is_active = FALSE will not be loaded into FactsStore on runtime creation.
 * 
 * POST /api/context/[eventId]/purge-facts
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

    // Verify event exists
    const { data: event, error: eventError } = await (supabase
      .from('events') as any)
      .select('id')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { ok: false, error: 'Event not found' },
        { status: 404 }
      );
    }

    // Set is_active = false for all facts for this event
    const { data, error } = await (supabase
      .from('facts') as any)
      .update({ is_active: false })
      .eq('event_id', eventId)
      .select('fact_key');

    if (error) {
      console.error('[api/context/purge-facts] Error purging facts:', error);
      return NextResponse.json(
        { ok: false, error: `Failed to purge facts: ${error.message}` },
        { status: 500 }
      );
    }

    const factCount = data?.length || 0;

    return NextResponse.json({
      ok: true,
      event_id: eventId,
      facts_purged: factCount,
      message: `Marked ${factCount} fact(s) as inactive for event ${eventId}`,
    });
  } catch (error: any) {
    console.error('[api/context/purge-facts] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

