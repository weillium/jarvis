'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';

/**
 * Hook to access authentication state and user session.
 * Uses React Query to cache and share auth state across components.
 * Sets up onAuthStateChange listener to update the cache when auth state changes.
 */
export function useAuth() {
  const queryClient = useQueryClient();

  // Use React Query to cache auth state
  const { data: session, isLoading } = useQuery<Session | null>({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[useAuth] Error getting session:', error);
        return null;
      }
      return data.session;
    },
    // Auth state is considered fresh for 5 minutes
    staleTime: 1000 * 60 * 5,
    // Keep in cache for 10 minutes
    gcTime: 1000 * 60 * 10,
    // Don't refetch on window focus or reconnect
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Set up auth state change listener to update React Query cache
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Update React Query cache when auth state changes
      // This fires immediately with the current session when subscribed,
      // so it will populate the cache right away
      queryClient.setQueryData<Session | null>(['auth', 'session'], newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async () => {
    await supabase.auth.signOut();
    // Invalidate auth query after sign out
    queryClient.setQueryData<Session | null>(['auth', 'session'], null);
  };

  return {
    user: session?.user ?? null,
    session,
    loading: isLoading,
    signOut,
  };
}

