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
    
    // Get current user session - try both getSession and getUser for better reliability
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // Log for debugging
    if (sessionError || userError || !session?.user || !user) {
      console.error('[Event Actions] Auth check failed:', {
        hasSession: !!session,
        hasUser: !!user,
        sessionError: sessionError?.message,
        userError: userError?.message,
      });
      return { data: null, error: 'Not authenticated' };
    }

    // Build query - use user.id from getUser() as it's more reliable
    const userId = user.id || session.user.id;
    let query = supabase
      .from('events')
      .select('*')
      .eq('owner_uid', userId)
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
    
    // Get current user session - try both getSession and getUser for better reliability
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (sessionError || userError || !session?.user || !user) {
      console.error('[Event Actions] Auth check failed for getEventById:', {
        hasSession: !!session,
        hasUser: !!user,
        sessionError: sessionError?.message,
        userError: userError?.message,
      });
      return { data: null, error: 'Not authenticated' };
    }

    // Fetch event - use user.id from getUser() as it's more reliable
    const userId = user.id || session.user.id;
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('owner_uid', userId)
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

export async function updateEvent(
  eventId: string,
  updates: {
    title?: string;
    topic?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  }
): Promise<{ data: EventWithStatus | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    
    // Get current user session - try both getSession and getUser for better reliability
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (sessionError || userError || !session?.user || !user) {
      console.error('[Event Actions] Auth check failed for updateEvent:', {
        hasSession: !!session,
        hasUser: !!user,
        sessionError: sessionError?.message,
        userError: userError?.message,
      });
      return { data: null, error: 'Not authenticated' };
    }

    // Verify user owns the event - use user.id from getUser() as it's more reliable
    const userId = user.id || session.user.id;
    const { data: eventCheck, error: eventError } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('owner_uid', userId)
      .single();

    if (eventError || !eventCheck) {
      return { data: null, error: 'Event not found or access denied' };
    }

    // Build update object (only include provided fields)
    const updateData: Record<string, any> = {};
    if (updates.title !== undefined) {
      updateData.title = updates.title.trim();
    }
    if (updates.topic !== undefined) {
      updateData.topic = updates.topic === null || updates.topic === '' ? null : updates.topic.trim();
    }
    if (updates.start_time !== undefined) {
      updateData.start_time = updates.start_time;
    }
    if (updates.end_time !== undefined) {
      updateData.end_time = updates.end_time;
    }

    // Update event
    const { data, error } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', eventId)
      .select()
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: 'Event not found after update' };
    }

    // Map to EventWithStatus
    const event = mapDbEventToEventWithStatus(data);

    return { data: event, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

