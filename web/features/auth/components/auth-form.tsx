'use client';

import { useState, FormEvent } from 'react';
import { supabase } from '@/shared/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { YStack, XStack, Text, Button, Input, Alert, FormField, Body } from '@jarvis/ui-core';

type AuthMode = 'login' | 'signup';

interface AuthFormProps {
  mode: AuthMode;
  onToggleMode: () => void;
}

export function AuthForm({ mode, onToggleMode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
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

      // Session is automatically synced to cookies via @supabase/ssr
      // Redirect to app dashboard
      router.push('/');
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred';
      console.error('[AuthForm] Auth error:', {
        mode,
        email,
        error: err,
        message: errorMessage,
        status: err.status,
        name: err.name,
        stack: err instanceof Error ? err.stack : undefined,
      });
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <YStack
      maxWidth={400}
      marginHorizontal="auto"
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

      <form onSubmit={handleSubmit}>
        <YStack gap="$5">
          {error && <Alert variant="error">{error}</Alert>}

          <FormField label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={(e: any) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </FormField>

          <FormField label="Password" required>
            <Input
              type="password"
              value={password}
              onChange={(e: any) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </FormField>

          <Button
            type="submit"
            disabled={loading}
            width="100%"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </Button>
        </YStack>
      </form>

      <XStack marginTop="$6" justifyContent="center" alignItems="center" gap="$2">
        <Body size="md" tone="muted" margin={0}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
        </Body>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleMode}
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
