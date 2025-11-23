import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    
    // Check authentication and event ownership
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    // Fetch context items, excluding those from superseded generation cycles
    // First, get all generation cycle IDs that are NOT superseded
    const { data: activeCycles, error: cycleError } = await supabase
      .from('generation_cycles')
      .select('id')
      .eq('event_id', eventId)
      .neq('status', 'superseded')
      .in('cycle_type', ['chunks', 'research']); // Context items come from chunks or research cycles

    if (cycleError) {
      console.warn('[api/context] Warning: Failed to fetch active cycles:', cycleError.message);
      // Continue with empty list - will only show legacy items
    }

    // Build list of active cycle IDs
    const activeCycleIds: string[] = [];
    if (activeCycles && activeCycles.length > 0) {
      activeCycleIds.push(...activeCycles.map((c: { id: string }) => c.id));
    }

    // Fetch context items only from active cycles (or null/legacy items)
    // Handle null generation_cycle_id separately since .in() doesn't match NULL
    // Note: After Phase 4, metadata fields are in JSONB metadata column
    let query = supabase
      .from('context_items')
      .select('id, chunk, metadata, rank, generation_cycle_id')
      .eq('event_id', eventId);

    if (activeCycleIds.length > 0) {
      // Include items with null generation_cycle_id OR items from active cycles
      query = query.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeCycleIds.join(',')})`);
    } else {
      // If no active cycles, only show legacy items (null generation_cycle_id)
      query = query.is('generation_cycle_id', null);
    }

    const { data, error } = await query
      .order('rank', { ascending: true, nullsFirst: true })
      .order('metadata->>enrichment_timestamp', { ascending: false, nullsFirst: true })
      .limit(200); // Limit to 200 items for performance

    if (error) {
      console.error('[api/context] Query error:', error.message, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sort client-side: rank first (if exists), then enrichment_timestamp (newest first)
    type ContextItem = {
      id: string;
      chunk: string;
      metadata: { enrichment_timestamp?: string } | null;
      rank: number | null;
      generation_cycle_id: string | null;
    };
    
    const sorted = (data || []).sort((a: ContextItem, b: ContextItem) => {
      // Primary sort: by rank (lower is better)
      const aRank = a.rank;
      const bRank = b.rank;
      if (aRank !== null && bRank !== null) {
        return aRank - bRank;
      }
      if (aRank !== null) return -1;
      if (bRank !== null) return 1;

      // Secondary sort: by enrichment_timestamp from metadata (newest first)
      const aTime = a.metadata?.enrichment_timestamp || '';
      const bTime = b.metadata?.enrichment_timestamp || '';
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return bTime.localeCompare(aTime);
    });

    return NextResponse.json({ data: sorted });
  } catch (error: unknown) {
    console.error('[api/context] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ 
      error: errorMessage
    }, { status: 500 });
  }
}

