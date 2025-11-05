'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';
import { Agent } from '@/shared/types/agent';

export async function getAgentByEventId(eventId: string): Promise<{ data: Agent | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

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

