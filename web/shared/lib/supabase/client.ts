'use client';

import { createBrowserClient } from '@supabase/ssr';

// Check environment variables are available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

// Validate URL format
try {
  if (supabaseUrl) {
    new URL(supabaseUrl);
  }
} catch (urlError) {
  throw new Error(
    'Invalid Supabase URL format. NEXT_PUBLIC_SUPABASE_URL must be a valid URL.'
  );
}

/**
 * Create a Supabase client for browser use.
 * Uses @supabase/ssr to automatically handle cookie management.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
}

// Export singleton for convenience
export const supabase = createClient();
