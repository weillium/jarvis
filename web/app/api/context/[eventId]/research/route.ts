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
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const apiFilter = searchParams.get('api');

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch research results, excluding those from superseded generation cycles
    // First, get all generation cycle IDs that are NOT superseded
    const { data: activeCycles, error: cycleError } = await (supabase
      .from('generation_cycles') as any)
      .select('id')
      .eq('event_id', eventId)
      .neq('status', 'superseded')
      .in('cycle_type', ['research']);

    if (cycleError) {
      console.warn('[api/context/research] Warning: Failed to fetch active cycles:', cycleError.message);
      // Continue with empty list - will only show legacy items
    }

    // Build list of active cycle IDs
    const activeCycleIds: string[] = [];
    if (activeCycles && activeCycles.length > 0) {
      activeCycleIds.push(...activeCycles.map((c: { id: string }) => c.id));
    }

    // Fetch research results only from active cycles (or null/legacy items)
    // Handle null generation_cycle_id separately since .in() doesn't match NULL
    // Only select needed fields - exclude large 'content' field initially (can be fetched on demand)
    let query = (supabase
      .from('research_results') as any)
      .select('id, query, api, content, source_url, quality_score, metadata, created_at, generation_cycle_id')
      .eq('event_id', eventId);

    if (activeCycleIds.length > 0) {
      // Include items with null generation_cycle_id OR items from active cycles
      query = query.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeCycleIds.join(',')})`);
    } else {
      // If no active cycles, only show legacy items (null generation_cycle_id)
      query = query.is('generation_cycle_id', null);
    }

    // Apply filters at database level
    if (apiFilter && apiFilter.trim() !== '') {
      query = query.eq('api', apiFilter);
    }

    if (search && search.trim() !== '') {
      // Search in query and content fields using ilike
      query = query.or(`query.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data: results, error } = await query
      .order('created_at', { ascending: false })
      .limit(200); // Limit to 200 results for performance

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




