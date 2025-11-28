import { router } from 'expo-router';
import { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import {
  XStack,
  YStack,
  Button,
  Heading,
  Body,
} from '@jarvis/ui-core';

interface AppShellNavProps {
  user: User;
}

export function AppShellNav({ user }: AppShellNavProps) {
  const handleSignOut = async () => {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[AppShellNav] Error signing out:', error);
      }
      router.replace('/');
    } catch (err) {
      console.error('[AppShellNav] Exception during sign out:', err);
      router.replace('/');
    }
  };

  return (
    <YStack
      backgroundColor="$background"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      paddingVertical="$4"
      paddingHorizontal="$6"
    >
      <XStack
        justifyContent="space-between"
        alignItems="center"
        width="100%"
      >
        <Button variant="ghost" onPress={() => router.push('/(app)/dashboard')}>
          <Heading level={3} color="$blue11" margin={0}>
            Jarvis
          </Heading>
        </Button>
        <XStack gap="$4" alignItems="center">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push('/(app)/dashboard')}
          >
            <Body color="$gray7" size="lg" weight="medium" margin={0}>
              Dashboard
            </Body>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.push('/(app)/events')}
          >
            <Body color="$gray7" size="lg" weight="medium" margin={0}>
              Events
            </Body>
          </Button>
          <XStack
            alignItems="center"
            gap="$4"
            marginLeft="$4"
            paddingLeft="$4"
            borderLeftWidth={1}
            borderLeftColor="$borderColor"
          >
            <Body size="sm" tone="muted" margin={0}>
              {user.email}
            </Body>
            <Button
              variant="outline"
              size="sm"
              onPress={handleSignOut}
            >
              Sign Out
            </Button>
          </XStack>
        </XStack>
      </XStack>
    </YStack>
  );
}

