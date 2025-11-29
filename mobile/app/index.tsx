import { useState, useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { AuthForm } from 'features/auth/components/auth-form'
import { YStack, LoadingState } from '@jarvis/ui-core'
import { supabase } from 'lib/supabase'

export default function LandingPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/(tabs)')
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/(tabs)')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <LoadingState title="Loading" description="Checking session..." />
      </YStack>
    )
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <YStack
        flex={1}
        backgroundColor="$background"
        alignItems="center"
        justifyContent="center"
        padding="$4"
      >
        <AuthForm
          mode={mode}
          onToggleMode={() => setMode(mode === 'login' ? 'signup' : 'login')}
        />
      </YStack>
    </>
  )
}
