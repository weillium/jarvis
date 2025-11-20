'use client';

import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase/client';
import {
  XStack,
  YStack,
  Button,
  Anchor,
  Heading,
  Body,
} from '@jarvis/ui-core';
import { styled } from 'tamagui';

interface AppShellNavProps {
  user: User;
}

const NavAnchor = styled(Anchor, {
  textDecorationLine: 'none',
});

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
    <header>
      <YStack
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
          <NavAnchor href="/">
            <Heading level={3} color="$blue11" margin={0}>
              Jarvis
            </Heading>
          </NavAnchor>
          <nav>
            <XStack gap="$6" alignItems="center">
          {[
            { href: '/', label: 'Dashboard' },
            { href: '/events', label: 'Events' },
            { href: '/agents', label: 'Agents' },
          ].map((item) => (
            <NavAnchor key={item.href} href={item.href}>
              <Body color="$gray7" size="lg" weight="medium" margin={0}>
                {item.label}
              </Body>
            </NavAnchor>
          ))}
          <XStack
            alignItems="center"
            gap="$4"
            marginLeft="$4"
            paddingLeft="$4"
            borderLeftWidth={1}
            borderLeftColor="$borderColor"
          >
            <NavAnchor href="/profile">
              <Body size="sm" tone="muted" margin={0}>
                {user.email}
              </Body>
            </NavAnchor>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>
          </XStack>
            </XStack>
          </nav>
        </XStack>
      </YStack>
    </header>
  );
}
