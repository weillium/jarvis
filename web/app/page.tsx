'use client';

import { useAuth } from '@/shared/hooks/use-auth';
import LandingPage from './(marketing)/components/landing-page';
import AppDashboard from './(app)/components/dashboard';
import { AppShellWrapper } from './(app)/components/app-shell-wrapper';
import { LoadingState, YStack } from '@jarvis/ui-core';

export default function RootPage() {
  const { user, loading } = useAuth();

  // Show loading state while checking auth
  if (loading) {
    return (
      <YStack minHeight="100vh" backgroundColor="$gray1" alignItems="center" justifyContent="center" padding="$6">
        <LoadingState title="Loading" description="Checking your session..." padding="$4" align="center" />
      </YStack>
    );
  }

  // Authenticated: show app dashboard with app shell
  if (user) {
    return (
      <AppShellWrapper>
        <AppDashboard />
      </AppShellWrapper>
    );
  }

  // Unauthenticated: show marketing landing
  return <LandingPage />;
}
