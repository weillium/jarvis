import { User } from '@supabase/supabase-js';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get current authenticated user.
 * @throws Error if not authenticated
 */
export async function requireAuth(supabase: SupabaseClient): Promise<User> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Not authenticated');
  }

  return user;
}

/**
 * Get current user (returns null if not authenticated).
 */
export async function getCurrentUser(
  supabase: SupabaseClient
): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * Verify user owns an event.
 * @throws Error if event not found or user doesn't own it
 */
export async function requireEventOwnership(
  supabase: SupabaseClient,
  userId: string,
  eventId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('owner_uid', userId)
    .single();

  if (error || !data) {
    throw new Error('Event not found or access denied');
  }
}

