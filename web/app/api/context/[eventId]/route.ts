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

    // Fetch context items from current generation cycle
    // Note: After Phase 4, metadata fields are in JSONB metadata column
    const { data, error } = await supabase
      .from('context_items')
      .select('id, chunk, metadata, rank, generation_cycle_id')
      .eq('event_id', eventId)
      .order('rank', { ascending: true, nullsFirst: true })
      .order('metadata->>enrichment_timestamp', { ascending: false, nullsFirst: true });

    if (error) {
      console.error('[api/context] Query error:', error.message, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sort client-side: rank first (if exists), then enrichment_timestamp (newest first)
    const sorted = (data || []).sort((a: any, b: any) => {
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
  } catch (error: any) {
    console.error('[api/context] Unexpected error:', error);
    return NextResponse.json({ 
      error: error?.message || 'Internal server error' 
    }, { status: 500 });
  }
}

