'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/features/auth/components/auth-form';
import { useAuth } from '@/shared/hooks/use-auth';
import { supabase } from '@/shared/lib/supabase/client';
import { YStack, Card, LoadingState } from '@jarvis/ui-core';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect if we have a confirmed, valid user
    // Give a small delay to ensure auth state is fully loaded
    if (!loading && user) {
      // Double-check user is actually valid by verifying with Supabase
      const checkUser = async () => {
        try {
          const { data: { user: verifiedUser }, error } = await supabase.auth.getUser();
          if (error) {
            console.error('[Auth Page] Error verifying user before redirect:', {
              message: error.message,
              status: error.status,
              name: error.name,
            });
            return;
          }
          if (verifiedUser && !error) {
            router.push('/');
          } else {
            console.warn('[Auth Page] User from useAuth but verification returned no user');
          }
        } catch (err) {
          console.error('[Auth Page] Exception verifying user before redirect:', {
            error: err,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
        }
      };
      checkUser();
    }
  }, [user, loading, router]);

  // Show loading state while checking auth, but don't redirect until we confirm user exists
  if (loading) {
    return (
      <YStack minHeight="100vh" backgroundColor="$gray1" alignItems="center" justifyContent="center" padding="$6">
        <LoadingState title="Checking your session" description="Verifying authentication status..." padding="$4" align="center" />
      </YStack>
    );
  }

  return (
    <YStack
      minHeight="100vh"
      backgroundColor="$gray1"
      alignItems="center"
      justifyContent="center"
      padding="$6"
    >
      <Card width="100%" maxWidth={480} padding="$5">
        <AuthForm
          mode={mode}
          onToggleMode={() => setMode(mode === 'login' ? 'signup' : 'login')}
        />
      </Card>
    </YStack>
  );
}
