import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AppShellNav } from '@/components/app-shell-nav';
import { YStack, LoadingState } from '@jarvis/ui-core';

export default function AppLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect to auth if not authenticated
    if (!loading && !user) {
      router.replace('/auth');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <YStack minHeight="100%" backgroundColor="$gray1" alignItems="center" justifyContent="center" padding="$6">
        <LoadingState title="Loading" description="Checking your session..." />
      </YStack>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <YStack minHeight="100%" backgroundColor="$gray1">
      <AppShellNav user={user} />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="events" />
      </Stack>
    </YStack>
  );
}

