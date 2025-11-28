import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

// Module-level session cache to ensure it's available synchronously
let globalSessionCache: Session | null | undefined = undefined;
const queryClientRefs = new Set<ReturnType<typeof useQueryClient>>();
let globalSubscription: { unsubscribe: () => void } | null = null;
let listenerRefCount = 0;

/**
 * Set up the auth state change listener.
 * The callback fires immediately with the current session when subscribed.
 */
function setupAuthListener(queryClient: ReturnType<typeof useQueryClient>) {
  queryClientRefs.add(queryClient);
  listenerRefCount++;

  if (globalSubscription) {
    return globalSubscription;
  }

  const supabase = getSupabaseClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, newSession) => {
    queryClientRefs.forEach((qc) => {
      qc.setQueryData<Session | null>(['auth', 'session'], newSession);
    });
    globalSessionCache = newSession;
  });

  globalSubscription = subscription;
  return subscription;
}

/**
 * Clean up the auth listener when a component unmounts.
 */
function cleanupAuthListener(queryClient: ReturnType<typeof useQueryClient>) {
  queryClientRefs.delete(queryClient);
  listenerRefCount--;

  if (listenerRefCount === 0 && globalSubscription) {
    globalSubscription.unsubscribe();
    globalSubscription = null;
  }
}

/**
 * Hook to access authentication state and user session.
 * Uses React Query to cache and share auth state across components.
 */
export function useAuth() {
  const queryClient = useQueryClient();
  const listenerSetupRef = useRef(false);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Set up listener only once, but do it in useEffect to avoid issues
  useEffect(() => {
    if (!listenerSetupRef.current) {
      try {
        subscriptionRef.current = setupAuthListener(queryClient);
        listenerSetupRef.current = true;
        console.log('[useAuth] Auth listener set up');
      } catch (error) {
        console.error('[useAuth] Error setting up auth listener:', error);
      }
    }
  }, [queryClient]);

  useEffect(() => {
    return () => {
      cleanupAuthListener(queryClient);
      listenerSetupRef.current = false;
      subscriptionRef.current = null;
    };
  }, [queryClient]);

  const cachedSession = queryClient.getQueryData<Session | null>(['auth', 'session']);
  const hasCachedData = cachedSession !== undefined;

  const { data: session, isLoading, isPending } = useQuery<Session | null>({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[useAuth] Error getting session:', error);
        return null;
      }
      return data.session;
    },
    initialData: hasCachedData ? cachedSession : undefined,
    placeholderData: !hasCachedData && globalSessionCache !== undefined 
      ? globalSessionCache 
      : undefined,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  const signOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    queryClient.setQueryData<Session | null>(['auth', 'session'], null);
  };

  const loading = isPending && session === undefined;

  return {
    user: session?.user ?? null,
    session,
    loading,
    signOut,
  };
}

