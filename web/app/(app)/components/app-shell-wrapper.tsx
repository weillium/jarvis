'use client';

import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/shared/hooks/use-auth';
import { AppShellNav } from './app-shell-nav';

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
    <section style={{
      minHeight: '100vh',
      background: '#f8fafc',
    }}>
      <AppShellNav user={user} />
      <div style={{
        padding: '24px',
        maxWidth: '1400px',
        margin: '0 auto',
      }}>
        {children}
      </div>
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

