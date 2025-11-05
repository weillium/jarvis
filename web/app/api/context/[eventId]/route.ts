import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const supabase = getSupabaseClient();

    // Fetch context items from current generation cycle
    // Note: After Phase 3, we filter by generation_cycle_id instead of is_active
    // For now, get all items (we'll filter by cycle in later updates)
    const { data, error } = await supabase
      .from('context_items')
      .select('id, source, chunk, enrichment_source, quality_score, enrichment_timestamp, chunk_size, metadata, rank, research_source, component_type, generation_cycle_id')
      .eq('event_id', eventId)
      .order('rank', { ascending: true, nullsFirst: true })
      .order('enrichment_timestamp', { ascending: false, nullsFirst: true });

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

      // Secondary sort: by enrichment_timestamp (newest first)
      const aTime = a.enrichment_timestamp || '';
      const bTime = b.enrichment_timestamp || '';
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

