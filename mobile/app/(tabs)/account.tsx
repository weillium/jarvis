import { useState, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { supabase } from 'lib/supabase'
import { YStack, Button, Text, LoadingState } from '@jarvis/ui-core'

export default function AccountPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email || null)
      setLoading(false)
    })
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background">
        <LoadingState title="Loading" description="Loading account..." />
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor="$background" padding="$6" gap="$6">
      <YStack gap="$3" alignItems="center">
        <Text fontSize="$6" fontWeight="600" color="$color">
          Account
        </Text>
        {email && (
          <Text fontSize="$4" color="$gray11">
            {email}
          </Text>
        )}
      </YStack>

      <Button onPress={handleSignOut} variant="outline" width="100%">
        Sign Out
      </Button>
    </YStack>
  )
}
