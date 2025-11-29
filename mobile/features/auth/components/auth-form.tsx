import { useState } from 'react'
import { supabase } from 'lib/supabase'
import { useRouter } from 'expo-router'
import { YStack, XStack, Text, Button, Input, Alert, FormField, Body } from '@jarvis/ui-core'
import { Alert as NativeAlert } from 'react-native'

type AuthMode = 'login' | 'signup'

interface AuthFormProps {
  mode: AuthMode
  onToggleMode: () => void
}

export function AuthForm({ mode, onToggleMode }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Please enter both email and password')
      return
    }

    setLoading(true)
    setError(null)

    try {
      let result
      if (mode === 'signup') {
        result = await supabase.auth.signUp({
          email,
          password,
        })
      } else {
        result = await supabase.auth.signInWithPassword({
          email,
          password,
        })
      }

      if (result.error) throw result.error

      if (mode === 'signup' && result.data.user && !result.data.session) {
        NativeAlert.alert('Check your email', 'Please check your email for a confirmation link.')
      } else {
        // Router will handle redirect based on auth state change in _layout or index
        router.replace('/(tabs)')
      }
    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred'
      console.error('[AuthForm] Auth error:', errorMessage)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <YStack
      maxWidth={400}
      width="100%"
      marginHorizontal="auto"
      paddingVertical="$4"
      paddingHorizontal="$5"
    >
      <YStack marginBottom="$6" alignItems="center" gap="$2">
        <Text
          fontSize="$7"
          fontWeight="600"
          color="$color"
        >
          {mode === 'login' ? 'Welcome Back' : 'Get Started'}
        </Text>
        <Text color="$gray11" fontSize="$3" textAlign="center">
          {mode === 'login'
            ? 'Sign in to your account'
            : 'Create your account to get started'}
        </Text>
      </YStack>

      <YStack gap="$4">
        {error && <Alert variant="error">{error}</Alert>}

        <FormField label="Email" required>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            disabled={loading}
          />
        </FormField>

        <FormField label="Password" required>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            disabled={loading}
          />
        </FormField>

        <Button
          onPress={handleSubmit}
          disabled={loading}
          width="100%"
          marginTop="$2"
        >
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
        </Button>
      </YStack>

      <XStack marginTop="$5" justifyContent="center" alignItems="center" gap="$1" alignSelf="center">
        <Body size="sm" tone="muted" margin={0}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
        </Body>
        <Button
          variant="ghost"
          size="sm"
          onPress={onToggleMode}
          paddingHorizontal="$1"
          paddingVertical="$0"
          minHeight="unset"
          height="auto"
        >
          <Body decoration="underline" weight="medium" color="$blue11" margin={0} fontSize="$3">
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </Body>
        </Button>
      </XStack>
    </YStack>
  )
}
