'use client';

import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // If there's an error or invalid session, clear it
      if (error || (session && !session.user)) {
        // Clear invalid session
        supabase.auth.signOut().catch(() => {
          // Ignore signOut errors
        });
        setSession(null);
        setUser(null);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Handle session errors
      if (event === 'SIGNED_OUT' || !session || !session.user) {
        setSession(null);
        setUser(null);
      } else {
        // Verify session is valid by checking user
        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error || !user) {
            // Invalid session - clear it
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
          } else {
            setSession(session);
            setUser(user);
          }
        } catch (err) {
          // Error verifying user - clear session
          setSession(null);
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    loading,
    signOut,
  };
}

