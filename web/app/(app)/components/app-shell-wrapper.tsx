'use client';

import { AuthGuard } from '@/features/auth/components/auth-guard';
import { useAuth } from '@/shared/hooks/use-auth';
import { AppShellNav } from './app-shell-nav';

interface AppShellWrapperProps {
  children: React.ReactNode;
}

function AppShell({ children }: AppShellWrapperProps) {
  const { user } = useAuth();

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

