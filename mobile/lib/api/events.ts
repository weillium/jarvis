import { getSupabaseClient } from '@/lib/supabase';
import { EventWithStatus } from '@/types/event';

export interface GetEventsOptions {
  search?: string;
  status?: 'all' | 'scheduled' | 'live' | 'ended';
  page?: number;
  limit?: number;
}

export interface GetEventsResult {
  data: EventWithStatus[] | null;
  error: string | null;
  total?: number;
  page?: number;
  limit?: number;
}

/**
 * Compute event status based on start_time and end_time
 */
function computeEventStatus(event: {
  start_time: string | null;
  end_time: string | null;
}): 'scheduled' | 'live' | 'ended' {
  const now = new Date();
  const start = event.start_time ? new Date(event.start_time) : null;
  const end = event.end_time ? new Date(event.end_time) : null;

  if (end && now > end) {
    return 'ended';
  }
  if (start && now >= start && (!end || now <= end)) {
    return 'live';
  }
  return 'scheduled';
}

/**
 * Map database event to EventWithStatus
 */
function mapDbEventToEventWithStatus(event: any): EventWithStatus {
  return {
    ...event,
    status: computeEventStatus(event),
  };
}

/**
 * Fetch events from Supabase
 */
export async function getEvents(options: GetEventsOptions = {}): Promise<GetEventsResult> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: 'Not authenticated' };
    }

    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('events')
      .select('id, owner_uid, title, topic, start_time, end_time, created_at', { count: 'exact' })
      .eq('owner_uid', user.id)
      .order('created_at', { ascending: false });

    // Apply search filter
    if (options.search) {
      query = query.or(`title.ilike.%${options.search}%,topic.ilike.%${options.search}%`);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: [], error: null, total: 0, page, limit };
    }

    // Map to EventWithStatus
    const events = data.map(mapDbEventToEventWithStatus);

    // Apply status filter client-side (since status is computed)
    let filteredEvents = events;
    if (options.status && options.status !== 'all') {
      filteredEvents = events.filter(event => event.status === options.status);
    }

    return {
      data: filteredEvents,
      error: null,
      total: count ?? 0,
      page,
      limit,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

