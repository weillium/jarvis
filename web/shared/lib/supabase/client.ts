'use client';

import { createClient } from '@supabase/supabase-js';

// Check environment variables are available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase Client] Missing environment variables:', {
    hasUrl: !!supabaseUrl,
    hasAnonKey: !!supabaseAnonKey,
    urlPreview: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'MISSING',
  });
  throw new Error('Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

// Validate URL format
try {
  if (supabaseUrl) {
    new URL(supabaseUrl);
  }
} catch (urlError) {
  console.error('[Supabase Client] Invalid Supabase URL format:', {
    url: supabaseUrl,
    error: urlError instanceof Error ? urlError.message : String(urlError),
  });
  throw new Error('Invalid Supabase URL format. NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
}

export const supabase = createClient(
  supabaseUrl!,
  supabaseAnonKey!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);

// Log client initialization
if (typeof window !== 'undefined') {
  console.log('[Supabase Client] Client initialized:', {
    hasUrl: !!supabaseUrl,
    hasAnonKey: !!supabaseAnonKey,
    url: supabaseUrl ? new URL(supabaseUrl).origin : 'MISSING',
    hasLocalStorage: typeof window.localStorage !== 'undefined',
  });
}

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
      console.error('[Supabase Client] Failed to sync session to cookies:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        hasSession: !!session,
        sessionExpiresAt: session?.expires_at,
      });
    }
  };

  // Sync initial session to cookies IMMEDIATELY from localStorage if available
  // This ensures cookies are available synchronously for server actions on first load
  // Try to read from localStorage directly (Supabase stores session there)
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const urlHash = supabaseUrl.split('//')[1]?.split('.')[0] || supabaseUrl.replace(/[^a-z0-9]/gi, '');
    const possibleKeys = [
      `sb-${urlHash}-auth-token`,
      `supabase.auth.token`,
    ];
    
    // Check all localStorage keys for auth data
    const allKeys = Object.keys(localStorage);
    const authKeys = allKeys.filter(k => k.includes('supabase') || (k.includes('sb-') && k.includes('auth')));
    
    for (const key of [...possibleKeys, ...authKeys]) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          let session: any = null;
          
          // Check different storage formats
          if (parsed?.currentSession && parsed.currentSession.access_token) {
            session = parsed.currentSession;
          } else if (parsed?.access_token && parsed?.user) {
            session = parsed;
          }
          
          if (session && session.access_token && session.refresh_token) {
            console.log('[Supabase Client] Found session in localStorage, syncing to cookies immediately:', { key });
            syncSessionToCookies(session);
            break; // Found and synced, no need to check more keys
          }
        }
      } catch (e) {
        // Not valid JSON or wrong format, continue
      }
    }
  } catch (err) {
    console.warn('[Supabase Client] Error reading localStorage for initial cookie sync:', err);
  }
  
  // Also use getSession() as fallback (async, but ensures we catch any session Supabase has)
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      console.log('[Supabase Client] Syncing session from getSession() to cookies');
      syncSessionToCookies(session);
    }
  }).catch((err) => {
    console.error('[Supabase Client] Error getting initial session for cookie sync:', err);
  });

  // Use setTimeout to defer initialization after module load
  setTimeout(() => {
    let isInitialAuthState = true;
    
    // Listen for auth state changes
    // NOTE: onAuthStateChange fires with the INITIAL session automatically when subscribed
    // This eliminates the need for a separate getSession() call that was causing race conditions
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Supabase Client] Auth state change in cookie sync:', { 
        event, 
        hasSession: !!session,
        isInitial: isInitialAuthState,
      });
      
      // Handle initial session verification
      if (isInitialAuthState && session) {
        isInitialAuthState = false;
        // Verify the initial session is valid
        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error || !user) {
            console.warn('[Supabase Client] Initial session invalid, clearing:', {
              error: error?.message,
              hasUser: !!user,
            });
            await supabase.auth.signOut();
            syncSessionToCookies(null);
            return;
          }
        } catch (err) {
          console.error('[Supabase Client] Error verifying initial session:', err);
          syncSessionToCookies(null);
          return;
        }
      } else if (isInitialAuthState) {
        // No initial session
        isInitialAuthState = false;
      }
      
      // Sync session to cookies (for server-side access)
      try {
        syncSessionToCookies(session);
        console.log('[Supabase Client] Cookies synced:', {
          event,
          hasSession: !!session,
          hasAccessToken: !!session?.access_token,
        });
      } catch (error) {
        console.error('[Supabase Client] Error syncing session to cookies:', {
          error,
          message: error instanceof Error ? error.message : String(error),
          event,
        });
      }
    });
  }, 0);
}
