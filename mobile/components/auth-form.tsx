import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { router } from 'expo-router';
import { YStack, XStack, Text, Button, Input, Alert, FormField, Body } from '@jarvis/ui-core';

type AuthMode = 'login' | 'signup';

interface AuthFormProps {
  mode: AuthMode;
  onToggleMode: () => void;
}

export function AuthForm({ mode, onToggleMode }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      let result;
      if (mode === 'signup') {
        result = await supabase.auth.signUp({
          email,
          password,
        });
      } else {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
      }

      if (result.error) throw result.error;

      // Redirect to dashboard
      router.replace('/(app)/dashboard');
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred';
      console.error('[AuthForm] Auth error:', {
        mode,
        email,
        error: err,
        message: errorMessage,
      });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <YStack
      maxWidth={400}
      width="100%"
      paddingVertical="$10"
      paddingHorizontal="$6"
    >
      <YStack marginBottom="$8" alignItems="center">
        <Text
          fontSize="$8"
          fontWeight="600"
          color="$color"
          marginBottom="$2"
        >
          {mode === 'login' ? 'Welcome Back' : 'Get Started'}
        </Text>
        <Text color="$gray11" fontSize="$4">
          {mode === 'login'
            ? 'Sign in to your account'
            : 'Create your account to get started'}
        </Text>
      </YStack>

      <YStack gap="$5">
        {error && <Alert variant="error">{error}</Alert>}

        <FormField label="Email" required>
          <Input
            value={email}
            onChangeText={setEmail}
            disabled={loading}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
        </FormField>

        <FormField label="Password" required>
          <Input
            value={password}
            onChangeText={setPassword}
            disabled={loading}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'login' ? 'password' : 'password-new'}
          />
        </FormField>

        <Button
          onPress={handleSubmit}
          disabled={loading}
          width="100%"
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
        </Button>
      </YStack>

      <XStack marginTop="$6" justifyContent="center" alignItems="center" gap="$2">
        <Body size="md" tone="muted" margin={0}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
        </Body>
        <Button
          variant="ghost"
          size="sm"
          onPress={onToggleMode}
          paddingHorizontal={0}
        >
          <Body decoration="underline" weight="medium" color="$blue11" margin={0}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </Body>
        </Button>
      </XStack>
    </YStack>
  );
}

