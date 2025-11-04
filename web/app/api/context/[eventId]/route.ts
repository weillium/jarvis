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

    // Fetch context items directly using service role (bypasses RLS)
    const { data, error } = await supabase
      .from('context_items')
      .select('id, source, chunk, enrichment_source, quality_score, enrichment_timestamp, chunk_size, metadata')
      .eq('event_id', eventId)
      .order('enrichment_timestamp', { ascending: false, nullsFirst: true });

    if (error) {
      console.error('[api/context] Query error:', error.message, error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sort client-side: enrichment_timestamp first (newest first)
    const sorted = (data || []).sort((a: any, b: any) => {
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

