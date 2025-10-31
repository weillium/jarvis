'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { Event, EventWithStatus } from '@/shared/types/event';
import { mapDbEventToEventWithStatus } from '../mappers/event-mapper';

export async function getEvents(filters?: {
  search?: string;
  status?: 'all' | 'scheduled' | 'live' | 'ended';
}): Promise<{ data: EventWithStatus[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return { data: null, error: 'Not authenticated' };
    }

    // Build query
    let query = supabase
      .from('events')
      .select('*')
      .eq('owner_uid', session.user.id)
      .order('created_at', { ascending: false });

    // Apply search filter
    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,topic.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: [], error: null };
    }

    // Map to EventWithStatus
    const events = data.map(mapDbEventToEventWithStatus);

    // Apply status filter client-side (since status is computed)
    let filteredEvents = events;
    if (filters?.status && filters.status !== 'all') {
      filteredEvents = events.filter(event => event.status === filters.status);
    }

    return { data: filteredEvents, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

export async function getEventById(eventId: string): Promise<{ data: EventWithStatus | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.user) {
      return { data: null, error: 'Not authenticated' };
    }

    // Fetch event
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('owner_uid', session.user.id)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: 'Event not found' };
    }

    // Map to EventWithStatus
    const event = mapDbEventToEventWithStatus(data);

    return { data: event, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

