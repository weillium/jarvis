'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';

export interface ContextItem {
  id: string;
  event_id?: string; // Optional since we may not always select it
  chunk: string;
  embedding?: number[] | null; // 1536-dim vector (not included in API response, but type exists)
  metadata: {
    source?: string;
    enrichment_source?: string;
    research_source?: string;
    component_type?: string;
    quality_score?: number | string;
    chunk_size?: number | string;
    enrichment_timestamp?: string;
  } | null;
  rank: number | null; // Chunk ranking: 1 = highest, higher = lower priority
  created_at?: string;
}

export async function getContextItemsByEventId(
  eventId: string
): Promise<{ data: ContextItem[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    // Fetch context items - metadata fields are now in JSONB metadata column (Phase 4)
    const { data, error } = await supabase
      .from('context_items')
      .select('id, chunk, metadata, rank')
      .eq('event_id', eventId)
      .order('metadata->>enrichment_timestamp', { ascending: false, nullsFirst: true });

    if (error) {
      console.error('[context-actions] Query error:', error.message, error);
      return { data: null, error: error.message };
    }

    // Sort client-side: enrichment_timestamp from metadata first (newest first)
    const sorted = (data || []).sort((a: any, b: any) => {
      const aTime = a.metadata?.enrichment_timestamp || '';
      const bTime = b.metadata?.enrichment_timestamp || '';
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return bTime.localeCompare(aTime);
    });

    return { data: sorted, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[context-actions] Unexpected error:', errorMessage, error);
    return { data: null, error: errorMessage };
  }
}

