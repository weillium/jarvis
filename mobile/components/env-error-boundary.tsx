import { Component, ReactNode } from 'react';
import { YStack, Heading, Body, Alert, Button } from '@jarvis/ui-core';
import Constants from 'expo-constants';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class EnvErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[EnvErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Safely check for Supabase config without accessing Constants during render
      let hasSupabaseConfig = false;
      try {
        hasSupabaseConfig = !!(
          Constants.expoConfig?.extra?.supabaseUrl || 
          Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
          process.env.EXPO_PUBLIC_SUPABASE_URL
        );
      } catch (e) {
        // Ignore errors when checking config
      }

      if (!hasSupabaseConfig) {
        return (
          <YStack flex={1} backgroundColor="$gray1" alignItems="center" justifyContent="center" padding="$6">
            <Alert variant="error" marginBottom="$4">
              <Heading level={4} marginBottom="$2">Missing Environment Variables</Heading>
              <Body marginBottom="$4">
                Please create a `.env.local` file in the mobile directory with:
              </Body>
              <Body fontFamily="$mono" backgroundColor="$gray2" padding="$3" borderRadius="$2" marginBottom="$4">
                EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421{'\n'}
                EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
              </Body>
              <Body size="sm" tone="muted">
                After creating the file, restart the Expo dev server.
              </Body>
            </Alert>
          </YStack>
        );
      }

      return (
        <YStack flex={1} backgroundColor="$gray1" alignItems="center" justifyContent="center" padding="$6">
          <Alert variant="error">
            <Heading level={4} marginBottom="$2">App Error</Heading>
            <Body marginBottom="$2">{this.state.error?.message || 'An unexpected error occurred'}</Body>
            <Body size="sm" tone="muted">
              Check the console for more details.
            </Body>
          </Alert>
        </YStack>
      );
    }

    return this.props.children;
  }
}

