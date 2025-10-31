'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { Agent } from '@/shared/types/agent';

export async function getAgentByEventId(eventId: string): Promise<{ data: Agent | null; error: string | null }> {
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

    // Fetch agent for the event
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('event_id', eventId)
      .single();

    if (error) {
      // If agent doesn't exist, return null (not an error)
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return { data: data as Agent, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

