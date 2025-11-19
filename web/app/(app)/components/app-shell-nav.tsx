'use client';

import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';
import { XStack, YStack, Text, Button, Separator, Anchor } from '@jarvis/ui-core';

interface AppShellNavProps {
  user: User;
}

export function AppShellNav({ user }: AppShellNavProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[AppShellNav] Error signing out:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
      }
      // Redirect to root (will show landing page for unauthenticated users)
      window.location.href = '/';
    } catch (err) {
      console.error('[AppShellNav] Exception during sign out:', {
        error: err,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      // Still redirect even on error
      window.location.href = '/';
    }
  };

  return (
    <YStack
      as="header"
      backgroundColor="$background"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
      paddingVertical="$4"
      paddingHorizontal="$6"
    >
      <XStack
        maxWidth={1400}
        marginHorizontal="auto"
        width="100%"
        justifyContent="space-between"
        alignItems="center"
      >
        <Anchor href="/" textDecorationLine="none">
          <Text fontSize="$6" fontWeight="600" color="$blue11">
            Jarvis
          </Text>
        </Anchor>
        <XStack as="nav" gap="$6" alignItems="center">
          {[
            { href: '/', label: 'Dashboard' },
            { href: '/events', label: 'Events' },
            { href: '/agents', label: 'Agents' },
          ].map((item) => (
            <Anchor key={item.href} href={item.href} textDecorationLine="none">
              <Text color="$gray7" fontSize="$4" fontWeight="500">
                {item.label}
              </Text>
            </Anchor>
          ))}
          <XStack
            alignItems="center"
            gap="$4"
            marginLeft="$4"
            paddingLeft="$4"
            borderLeftWidth={1}
            borderLeftColor="$borderColor"
          >
            <Anchor href="/profile" textDecorationLine="none">
              <Text fontSize="$3" color="$gray11">
                {user.email}
              </Text>
            </Anchor>
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
