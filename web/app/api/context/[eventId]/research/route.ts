import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Research Results API Route
 * 
 * Returns all active research results for an event.
 * 
 * GET /api/context/[eventId]/research
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

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch active research results
    const { data: results, error } = await (supabase
      .from('research_results') as any)
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[api/context/research] Error fetching research results:', error);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch research results: ${error.message}` },
        { status: 500 }
      );
    }

    // Calculate statistics
    const byApi: Record<string, number> = {};
    let totalQuality = 0;
    let qualityCount = 0;

    (results || []).forEach((result: any) => {
      byApi[result.api] = (byApi[result.api] || 0) + 1;
      if (result.quality_score !== null) {
        totalQuality += result.quality_score;
        qualityCount++;
      }
    });

    const avgQualityScore = qualityCount > 0 ? totalQuality / qualityCount : 0;

    return NextResponse.json({
      ok: true,
      results: results || [],
      count: (results || []).length,
      byApi,
      avgQualityScore,
    });
  } catch (error: any) {
    console.error('[api/context/research] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}




