import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseClient(
  supabaseUrl: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
