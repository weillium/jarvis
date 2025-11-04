'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { Card } from '@/shared/types/card';

export async function getCardsByEventId(eventId: string): Promise<{ data: Card[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return { data: null, error: 'Not authenticated' };
    }

    // Verify user owns the event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('owner_uid', session.user.id)
      .single();

    if (eventError || !event) {
      return { data: null, error: 'Event not found or access denied' };
    }

    // Fetch cards for the event
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('event_id', eventId)
      .order('emitted_at', { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

