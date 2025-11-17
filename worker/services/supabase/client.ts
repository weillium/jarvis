import { createClient } from '@supabase/supabase-js';

export function createSupabaseClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export type WorkerSupabaseClient = ReturnType<typeof createSupabaseClient>;
