'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';
import { Card } from '@/shared/types/card';

export async function getCardsByEventId(eventId: string): Promise<{ data: Card[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    // Fetch cards for the event from agent_outputs
    const { data, error } = await supabase
      .from('agent_outputs')
      .select('id, event_id, payload, created_at')
      .eq('event_id', eventId)
      .eq('agent_type', 'cards')
      .eq('type', 'card')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    // Map to Card type
    const cards: Card[] = (data || []).map(output => ({
      id: output.id,
      event_id: output.event_id,
      emitted_at: output.created_at,
      kind: output.payload?.kind || 'Context',
      payload: output.payload,
    }));

    return { data: cards, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

