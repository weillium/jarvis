'use client';

import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/shared/hooks/use-auth';
import { AppShellNav } from './app-shell-nav';
import { YStack } from '@jarvis/ui-core';

interface AppShellWrapperProps {
  children: React.ReactNode;
}

function AppShell({ children }: AppShellWrapperProps) {
  const { user, loading } = useAuth();

  // This should be protected by AuthGuard, but log if we somehow get here without a user
  if (!loading && !user) {
    console.warn('[AppShell] AppShell rendered without user (should be protected by AuthGuard)');
    return null;
  }

  if (loading) {
    // Still loading, AuthGuard will handle the loading state
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <section>
      <YStack
        minHeight="100vh"
        backgroundColor="$gray1"
      >
        <AppShellNav user={user} />
        <YStack
          padding="$6"
          maxWidth={1400}
          marginHorizontal="auto"
          width="100%"
        >
          {children}
        </YStack>
      </YStack>
    </section>
  );
}

export function AppShellWrapper({ children }: AppShellWrapperProps) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}

