'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/shared/hooks/use-auth';
import { YStack, LoadingState } from '@jarvis/ui-core';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      console.log('[AuthGuard] No user found, redirecting to auth page');
      router.push('/auth');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading) {
      console.log('[AuthGuard] Loading auth state...');
    } else if (user) {
      console.log('[AuthGuard] User authenticated:', { userId: user.id, email: user.email });
    } else {
      console.warn('[AuthGuard] Auth guard rendered without user (should redirect)');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <YStack minHeight="100vh" alignItems="center" justifyContent="center" backgroundColor="$background" padding="$4">
        <LoadingState title="Authenticating" description="Checking your access…" padding="$4" />
      </YStack>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
