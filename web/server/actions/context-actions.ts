'use server';

import { createServerClient } from '@/shared/lib/supabase/server';

export interface ContextItem {
  id: string;
  event_id: string;
  source: string;
  chunk: string;
  embedding: number[] | null; // 1536-dim vector (not included in API response, but type exists)
  enrichment_source: string | null;
  quality_score: number | null;
  enrichment_timestamp: string | null;
  chunk_size: number | null;
  metadata: Record<string, any> | null;
  rank: number | null; // Chunk ranking: 1 = highest, higher = lower priority
  research_source: string | null; // 'exa', 'wikipedia', 'document', 'llm_generation'
  created_at: string;
}

export async function getContextItemsByEventId(
  eventId: string
): Promise<{ data: ContextItem[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      console.error('[context-actions] Session error:', sessionError?.message || 'No session');
      return { data: null, error: 'Not authenticated' };
    }

    // Verify user owns the event (via RLS or explicit check)
    const { data: eventCheck, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('owner_uid', session.user.id)
      .single();

    if (eventError || !eventCheck) {
      console.error('[context-actions] Event check error:', eventError?.message || 'Event not found');
      return { data: null, error: 'Event not found or access denied' };
    }

    // Fetch context items - only select columns that exist
    // Note: created_at might not exist in all migrations, so we'll handle it gracefully
    const { data, error } = await supabase
      .from('context_items')
      .select('id, source, chunk, enrichment_source, quality_score, enrichment_timestamp, chunk_size, metadata')
      .eq('event_id', eventId)
      .order('enrichment_timestamp', { ascending: false, nullsFirst: true });

    if (error) {
      console.error('[context-actions] Query error:', error.message, error);
      return { data: null, error: error.message };
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

    return { data: sorted, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[context-actions] Unexpected error:', errorMessage, error);
    return { data: null, error: errorMessage };
  }
}

