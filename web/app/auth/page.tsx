'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/features/auth/components/auth-form';
import { useAuth } from '@/shared/hooks/use-auth';
import { YStack, Card, LoadingState } from '@jarvis/ui-core';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect if user is authenticated (useAuth already verified the session)
    if (!loading && user) {
      router.push('/');
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
