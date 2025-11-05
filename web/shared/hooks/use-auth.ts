'use client';

import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[useAuth] Starting auth initialization...');
    const startTime = Date.now();
    let isInitialized = false;
    
    // Function to finalize auth state (only call once)
    const finalizeAuth = (session: Session | null, user: User | null, source: string) => {
      if (isInitialized) {
        console.log('[useAuth] Already initialized, ignoring duplicate finalize from:', source);
        return;
      }
      isInitialized = true;
      const elapsed = Date.now() - startTime;
      console.log('[useAuth] Finalizing auth state:', { 
        source, 
        hasSession: !!session, 
        hasUser: !!user,
        elapsed 
      });
      
      setSession(session);
      setUser(user);
      setLoading(false);
    };

    // Try to read session from localStorage synchronously as immediate fallback
    // This helps in cases where onAuthStateChange doesn't fire (e.g., React Strict Mode re-renders)
    let localStorageSession: Session | null = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Supabase stores session in localStorage with a specific key pattern
        // Key format: sb-<project-ref>-auth-token
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const urlHash = supabaseUrl.split('//')[1]?.split('.')[0] || 'default';
        
        // Try multiple possible key formats
        const possibleKeys = [
          `sb-${urlHash}-auth-token`,
          `supabase.auth.token`,
        ];
        
        // Also check all keys that might contain auth data
        const allKeys = Object.keys(localStorage);
        const authKeys = allKeys.filter(k => k.includes('supabase') || k.includes('sb-') || k.includes('auth'));
        
        for (const key of [...possibleKeys, ...authKeys]) {
          try {
            const stored = localStorage.getItem(key);
            if (stored) {
              const parsed = JSON.parse(stored);
              // Supabase stores: { currentSession: Session, expiresAt: number }
              if (parsed && parsed.currentSession && parsed.currentSession.user) {
                localStorageSession = parsed.currentSession;
                console.log('[useAuth] Found session in localStorage:', { key, hasUser: !!parsed.currentSession.user });
                break;
              }
              // Also check if it's stored directly as session
              if (parsed && parsed.user && parsed.access_token) {
                localStorageSession = parsed as Session;
                console.log('[useAuth] Found session in localStorage (direct format):', { key });
                break;
              }
            }
          } catch (e) {
            // Not valid JSON or wrong format, continue
          }
        }
      }
    } catch (e) {
      // localStorage access failed, ignore
      console.warn('[useAuth] Error reading localStorage:', e);
    }

    // Set up onAuthStateChange FIRST - it fires immediately with initial state
    // This is critical to catch sessions that were just created (e.g., after sign-in)
    // CRITICAL: Never call async Supabase methods directly in onAuthStateChange callback
    // This causes a deadlock bug in supabase-js. Always defer async operations with setTimeout.
    let isFirstAuthStateChange = true;
    let authStateChangeReceived = false;
    
    // Log when subscription is created
    console.log('[useAuth] Setting up onAuthStateChange subscription...');
    const subscriptionStartTime = Date.now();
    
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Set flag immediately (synchronously) so other timeouts can check it
      const isFirst = isFirstAuthStateChange;
      isFirstAuthStateChange = false;
      authStateChangeReceived = true;
      
      const elapsedFromSubscription = Date.now() - subscriptionStartTime;
      const elapsedFromEffect = Date.now() - startTime;
      
      console.log('[useAuth] Auth state change received:', { 
        event, 
        hasSession: !!session,
        isFirst,
        elapsedFromSubscription,
        elapsedFromEffect,
      });
      
      // CRITICAL: Keep callback synchronous - defer all async operations
      // Calling async Supabase methods directly here causes a deadlock bug
      // BUT: For the first event, we need to process it immediately to avoid delay
      // We'll still defer async operations like getUser() but set state synchronously
      setTimeout(() => {
        const elapsed = Date.now() - startTime;
        
        console.log('[useAuth] Processing auth state change:', { 
          event, 
          hasSession: !!session, 
          isFirst,
          elapsed 
        });
        
        // If we already initialized, only handle subsequent changes
        if (isInitialized && !isFirst) {
          // Handle subsequent auth changes
          if (event === 'SIGNED_OUT' || !session || !session.user) {
            setSession(null);
            setUser(null);
          } else {
            // Use session immediately, verify in background (deferred)
            setSession(session);
            setUser(session.user);
            // Defer getUser() call to avoid deadlock
            setTimeout(() => {
              supabase.auth.getUser()
                .then(({ data: { user }, error }) => {
                  if (!error && user && user.id !== session.user.id) {
                    setUser(user);
                  }
                })
                .catch(() => {});
            }, 0);
          }
          return;
        }
        
        // Use onAuthStateChange as primary source
        if (!isInitialized) {
          if (event === 'SIGNED_OUT' || !session || !session.user) {
            finalizeAuth(null, null, 'onAuthStateChange-no-session');
            return;
          }
          
          // Use session immediately (don't wait for getUser() which can hang)
          finalizeAuth(session, session.user, 'onAuthStateChange-success');
          
          // Verify user in background (non-blocking, deferred to avoid deadlock)
          setTimeout(() => {
            supabase.auth.getUser()
              .then(({ data: { user }, error }) => {
                if (error || !user) {
                  console.warn('[useAuth] Background verification failed, clearing session');
                  supabase.auth.signOut().catch(() => {});
                  setSession(null);
                  setUser(null);
                } else if (user.id !== session.user.id) {
                  setUser(user);
                }
              })
              .catch((err) => {
                console.error('[useAuth] Background verification error (non-critical):', err);
              });
          }, 0);
        }
      }, 0);
    });
    
    // Log subscription setup completion
    console.log('[useAuth] onAuthStateChange subscription created, waiting for initial event...');

    // According to Supabase docs, onAuthStateChange should fire immediately when subscribed,
    // but in practice it may not always fire synchronously. We'll use a short timeout to detect
    // if it's going to fire, and if not, fall back to localStorage which we know has the session.
    
    // Also try getSession() with a timeout as a backup - this is safe because:
    // 1. We only call it if onAuthStateChange hasn't fired yet
    // 2. We use Promise.race with a timeout to prevent hanging
    // 3. We only use it if localStorage has a session (indicating we should have one)
    if (localStorageSession && localStorageSession.user) {
      // Try getSession() with a 100ms timeout to avoid hanging
      Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null }, error: null }>((resolve) => 
          setTimeout(() => resolve({ data: { session: null }, error: null }), 100)
        ),
      ]).then((result) => {
        // Only use getSession() result if onAuthStateChange hasn't fired yet
        if (!isInitialized && !authStateChangeReceived) {
          const { data: { session } } = result;
          if (session && session.user) {
            console.log('[useAuth] getSession() returned session (onAuthStateChange backup)');
            finalizeAuth(session, session.user, 'getSession-backup');
          }
        }
      }).catch((err) => {
        // Ignore errors - we have other fallbacks
        console.debug('[useAuth] getSession() backup failed (non-critical):', err);
      });
    }
    
    // Use a very short timeout to check if onAuthStateChange fires immediately
    // If it doesn't fire within 50ms, it's likely not going to fire synchronously
    // In that case, use localStorage as a fallback (we already synced cookies from it)
    const immediateCheckTimeout = setTimeout(() => {
      if (!isInitialized && !authStateChangeReceived && localStorageSession && localStorageSession.user) {
        console.log('[useAuth] onAuthStateChange did not fire immediately, using localStorage fallback');
        finalizeAuth(localStorageSession, localStorageSession.user, 'localStorage-immediate-fallback');
      }
    }, 50); // Short timeout to detect if onAuthStateChange fires synchronously
    
    // Longer timeout as final fallback
    const localStorageCheckTimeout = setTimeout(() => {
      if (!isInitialized && !authStateChangeReceived && localStorageSession && localStorageSession.user) {
        console.warn('[useAuth] onAuthStateChange did not fire within 500ms, using localStorage fallback');
        finalizeAuth(localStorageSession, localStorageSession.user, 'localStorage-fallback');
      }
    }, 500);

    // Final fallback timeout - if nothing works after 2 seconds, assume no session
    // Reduced from 5s since we have localStorage fallback that fires earlier
    const fallbackTimeout = setTimeout(() => {
      if (!isInitialized) {
        console.warn('[useAuth] Final fallback timeout - no auth state received', {
          elapsed: Date.now() - startTime,
          authStateChangeReceived,
          hasLocalStorageSession: !!localStorageSession,
        });
        
        // If we have a localStorage session, use it (shouldn't happen if earlier checks worked)
        if (localStorageSession && localStorageSession.user) {
          console.log('[useAuth] Using localStorage session as final fallback');
          finalizeAuth(localStorageSession, localStorageSession.user, 'localStorage-final-fallback');
        } else {
          // No session found anywhere
          console.error('[useAuth] No session found, assuming unauthenticated');
          finalizeAuth(null, null, 'fallback-timeout');
        }
      }
    }, 2000);

    return () => {
      clearTimeout(immediateCheckTimeout);
      clearTimeout(localStorageCheckTimeout);
      clearTimeout(fallbackTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[useAuth] Error signing out:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
      }
    } catch (err) {
      console.error('[useAuth] Exception during sign out:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  };

  return {
    user,
    session,
    loading,
    signOut,
  };
}

