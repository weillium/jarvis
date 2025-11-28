import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View, Text as RNText } from 'react-native';

// Lazy load components to avoid module initialization errors
let useAuth: any;
let LandingPage: any;
let YStack: any;
let LoadingState: any;
let Text: any;
let Heading: any;

try {
  const authHook = require('@/hooks/use-auth');
  useAuth = authHook.useAuth;
  console.log('[index] useAuth loaded');
} catch (e) {
  console.error('[index] Failed to load useAuth:', e);
}

try {
  const landing = require('@/components/landing-page');
  LandingPage = landing.LandingPage;
  console.log('[index] LandingPage loaded');
} catch (e) {
  console.error('[index] Failed to load LandingPage:', e);
}

try {
  const uiCore = require('@jarvis/ui-core');
  YStack = uiCore.YStack;
  LoadingState = uiCore.LoadingState;
  Text = uiCore.Text;
  Heading = uiCore.Heading;
  console.log('[index] UI components loaded');
} catch (e) {
  console.error('[index] Failed to load UI components:', e);
}

export default function RootPage() {
  console.log('[RootPage] Component rendering');
  const [mounted, setMounted] = useState(false);
  
  // Always call useAuth hook (hooks must be called unconditionally)
  // But handle errors if the module didn't load
  let user = null;
  let loading = false;
  
  if (useAuth) {
    try {
      const authResult = useAuth();
      user = authResult?.user ?? null;
      loading = authResult?.loading ?? false;
      console.log('[RootPage] Auth state:', { user: !!user, loading });
    } catch (e) {
      console.error('[RootPage] Error calling useAuth:', e);
      loading = false;
    }
  } else {
    console.warn('[RootPage] useAuth not available, showing landing page');
    loading = false;
  }

  useEffect(() => {
    setMounted(true);
    console.log('[RootPage] Component mounted');
  }, []);

  // Debug logging
  useEffect(() => {
    console.log('[RootPage] Auth state:', { user: !!user, loading, userId: user?.id, mounted });
  }, [user, loading, mounted]);

  useEffect(() => {
    // Redirect to dashboard if authenticated
    if (mounted && !loading && user) {
      console.log('[RootPage] Redirecting to dashboard');
      router.replace('/(app)/dashboard');
    }
  }, [user, loading, mounted]);

  // Fallback to React Native components if UI components didn't load
  if (!YStack) {
    return (
      <View style={{ flex: 1, backgroundColor: 'blue', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <RNText style={{ color: 'white', fontSize: 18, marginBottom: 8 }}>UI Components Loading...</RNText>
        <RNText style={{ color: 'white', fontSize: 14 }}>Check console for errors</RNText>
      </View>
    );
  }

  // Show a simple test first to verify rendering works
  if (!mounted) {
    return (
      <YStack flex={1} backgroundColor="blue" alignItems="center" justifyContent="center" padding="$6">
        <Heading color="white">Initializing...</Heading>
        <Text color="white" marginTop="$4">Check Metro console for logs</Text>
      </YStack>
    );
  }

  // Show loading state while checking auth
  if (loading) {
    console.log('[RootPage] Showing loading state');
    if (LoadingState) {
      return (
        <YStack flex={1} backgroundColor="$gray1" alignItems="center" justifyContent="center" padding="$6">
          <YStack alignItems="center" gap="$4">
            <LoadingState title="Loading" description="Checking your session..." />
            <Text size="sm" tone="muted">Debug: loading=true, user={user ? 'exists' : 'null'}</Text>
          </YStack>
        </YStack>
      );
    }
    return (
      <View style={{ flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
        <RNText>Loading...</RNText>
      </View>
    );
  }

  // Unauthenticated: show marketing landing
  if (!user) {
    console.log('[RootPage] Showing landing page (no user)');
    if (LandingPage) {
      try {
        return (
          <YStack flex={1}>
            <LandingPage />
            {/* Debug overlay */}
            <YStack 
              position="absolute" 
              top={10} 
              right={10} 
              backgroundColor="rgba(0,0,0,0.7)" 
              padding="$2" 
              borderRadius="$2"
              zIndex={9999}
            >
              <Text color="white" size="xs">Debug: No user</Text>
            </YStack>
          </YStack>
        );
      } catch (error) {
        console.error('[RootPage] Error rendering LandingPage:', error);
      }
    }
    // Fallback if LandingPage didn't load
    return (
      <View style={{ flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <RNText style={{ fontSize: 18, marginBottom: 8 }}>Welcome to Jarvis</RNText>
        <RNText style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>
          Landing page component failed to load. Check console for errors.
        </RNText>
      </View>
    );
  }

  // Fallback - should not reach here
  console.log('[RootPage] Fallback render');
  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
      <RNText>Redirecting...</RNText>
    </View>
  );
}

