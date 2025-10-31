'use client';

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);

// Sync session to cookies for server-side access (deferred to avoid module init issues)
if (typeof window !== 'undefined') {
  const syncSessionToCookies = (session: any) => {
    try {
      if (session) {
        const maxAge = Math.floor((session.expires_at! * 1000 - Date.now()) / 1000);
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${Math.max(maxAge, 60)}; SameSite=Lax`;
        document.cookie = `sb-refresh-token=${session.refresh_token}; path=/; max-age=604800; SameSite=Lax`;
      } else {
        document.cookie = 'sb-access-token=; path=/; max-age=0';
        document.cookie = 'sb-refresh-token=; path=/; max-age=0';
      }
    } catch (error) {
      console.warn('Failed to sync session to cookies:', error);
    }
  };

  // Use setTimeout to defer initialization after module load
  setTimeout(() => {
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((_event, session) => {
      syncSessionToCookies(session);
    });

    // Initialize cookies on mount (deferred)
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSessionToCookies(session);
    }).catch((error) => {
      console.warn('Failed to get initial session:', error);
    });
  }, 0);
}
