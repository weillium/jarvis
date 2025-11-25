'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';

// Module-level session cache to ensure it's available synchronously
// This is populated by the listener callback which fires immediately when subscribed
let globalSessionCache: Session | null | undefined = undefined;
const queryClientRefs = new Set<ReturnType<typeof useQueryClient>>();
let globalSubscription: { unsubscribe: () => void } | null = null;
let listenerRefCount = 0;

/**
 * Set up the auth state change listener.
 * The callback fires immediately with the current session when subscribed.
 * Uses ref counting to only set up one listener for all components.
 */
function setupAuthListener(queryClient: ReturnType<typeof useQueryClient>) {
  // Track this queryClient so we can update it
  queryClientRefs.add(queryClient);
  listenerRefCount++;

  // Only set up listener once
  if (globalSubscription) {
    return globalSubscription;
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, newSession) => {
    // Update React Query cache for all tracked queryClients
    queryClientRefs.forEach((qc) => {
      qc.setQueryData<Session | null>(['auth', 'session'], newSession);
    });
    // Update module-level cache
    globalSessionCache = newSession;
  });

  globalSubscription = subscription;
  return subscription;
}

/**
 * Clean up the auth listener when a component unmounts.
 * Only actually unsubscribes when the last component unmounts.
 */
function cleanupAuthListener(queryClient: ReturnType<typeof useQueryClient>) {
  queryClientRefs.delete(queryClient);
  listenerRefCount--;

  // Only unsubscribe when last component unmounts
  if (listenerRefCount === 0 && globalSubscription) {
    globalSubscription.unsubscribe();
    globalSubscription = null;
  }
}

/**
 * Hook to access authentication state and user session.
 * Uses React Query to cache and share auth state across components.
 * Sets up onAuthStateChange listener to update the cache when auth state changes.
 * 
 * The listener fires immediately with the current session, which we use to populate
 * the cache synchronously, preventing the loading state when navigating between pages.
 */
export function useAuth() {
  const queryClient = useQueryClient();
  const listenerSetupRef = useRef(false);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Set up listener on first use - callback fires immediately with current session
  // This populates globalSessionCache synchronously before the query runs
  if (!listenerSetupRef.current) {
    subscriptionRef.current = setupAuthListener(queryClient);
    listenerSetupRef.current = true;
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAuthListener(queryClient);
      listenerSetupRef.current = false;
      subscriptionRef.current = null;
    };
  }, [queryClient]);

  // Check cache for existing data
  const cachedSession = queryClient.getQueryData<Session | null>(['auth', 'session']);
  const hasCachedData = cachedSession !== undefined;

  // Use React Query to cache auth state
  // If we have cached data, use it as initialData to prevent loading state
  // The listener will keep it updated
  const { data: session, isLoading, isPending } = useQuery<Session | null>({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[useAuth] Error getting session:', error);
        return null;
      }
      return data.session;
    },
    // Use cached data as initialData to prevent loading state
    initialData: hasCachedData ? cachedSession : undefined,
    // Use global session cache as placeholderData if no React Query cache
    // This is populated synchronously by the listener callback
    placeholderData: !hasCachedData && globalSessionCache !== undefined 
      ? globalSessionCache 
      : undefined,
    // Auth state is considered fresh for 5 minutes
    staleTime: 1000 * 60 * 5,
    // Keep in cache for 10 minutes
    gcTime: 1000 * 60 * 10,
    // Don't refetch on window focus or reconnect
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Don't refetch on mount if data is fresh - prevents unnecessary auth checks on navigation
    // The listener will update it if auth state actually changes
    refetchOnMount: false,
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    // Invalidate auth query after sign out
    queryClient.setQueryData<Session | null>(['auth', 'session'], null);
  };

  // Only show loading if we truly don't have any data yet
  // If we have session data (from query, cache, or placeholder), don't show loading
  // This prevents the "authenticating" screen on navigation when session is already known
  // isPending is false when we have initialData or placeholderData
  const loading = isPending && session === undefined;

  return {
    user: session?.user ?? null,
    session,
    loading,
    signOut,
  };
}

