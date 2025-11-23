import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Transcripts API Route
 * 
 * Fetches recent finalized transcripts for an event (equivalent to what's in ring buffer)
 * Returns transcripts from the last 5 minutes, up to 150 transcripts (default), ordered by sequence
 * 
 * GET /api/transcripts/[eventId]
 * Query params:
 *   - limit: number (default: 150)
 *   - max_age_minutes: number (default: 5)
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { searchParams } = new URL(req.url);
    
    const limit = parseInt(searchParams.get('limit') || '150', 10);
    const maxAgeMinutes = parseInt(searchParams.get('max_age_minutes') || '5', 10);
    
    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Calculate cutoff time (5 minutes ago in milliseconds)
    const nowMs = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    const cutoffMs = nowMs - maxAgeMs;

    // Fetch recent finalized transcripts (what would be in ring buffer)
    // Order by seq ASC directly (oldest first) for display - no need to sort client-side
    const { data: transcripts, error } = await (supabase
      .from('transcripts') as any)
      .select('id, seq, at_ms, speaker, text, final, ts')
      .eq('event_id', eventId)
      .eq('final', true)
      .gte('at_ms', cutoffMs) // Only transcripts from last 5 minutes
      .order('seq', { ascending: true }) // Oldest first (for display)
      .limit(limit);

    if (error) {
      console.error('[api/transcripts] Error fetching transcripts:', error);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch transcripts: ${error.message}` },
        { status: 500 }
      );
    }

    // Transcripts are already sorted by seq ASC from the database
    const sortedTranscripts = transcripts || [];

    return NextResponse.json({
      ok: true,
      transcripts: sortedTranscripts,
      count: sortedTranscripts.length,
      event_id: eventId,
    });
  } catch (error: any) {
    console.error('[api/transcripts] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

