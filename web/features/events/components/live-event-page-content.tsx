'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { EventWithStatus } from '@/shared/types/event';
import { LiveEventTabs } from './live-event-tabs';
import { useContextSSE } from '@/shared/hooks/use-context-sse';
import {
  PageContainer,
  PageHeader,
  Heading,
  Body,
  Button,
  Card,
  YStack,
} from '@jarvis/ui-core';

interface LiveEventPageContentProps {
  event: EventWithStatus | null;
  eventId: string;
  error?: string | null;
}

export function LiveEventPageContent({ event, eventId, error }: LiveEventPageContentProps) {
  const router = useRouter();

  // Connect to SSE stream and automatically invalidate queries when data updates
  useContextSSE({ eventId, enabled: !!event });

  // Prefetch likely next routes to reduce navigation latency
  useEffect(() => {
    // Prefetch edit page and events list as common navigation targets
    router.prefetch(`/events/${eventId}/edit`);
    router.prefetch('/events');
  }, [router, eventId]);

  if (!event) {
    return (
      <PageContainer>
        <Card padding="$6" alignItems="center" gap="$3">
          <Heading level={4}>Event Not Found</Heading>
          <Body tone="muted" align="center">
            {error || 'The event you are looking for does not exist or you do not have access to it.'}
          </Body>
          <Button onClick={() => router.push('/events')}>
            Back to Events
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <YStack gap="$3">
        <YStack alignSelf="flex-start">
          <Button variant="ghost" size="sm" onClick={() => router.push('/events')}>
            ← Back to Events
          </Button>
        </YStack>
        <PageHeader>
          <Heading level={3}>Live Event View</Heading>
          <Body tone="muted">Monitor live status and agent activity</Body>
        </PageHeader>
      </YStack>
      <LiveEventTabs event={event} eventId={eventId} />
    </PageContainer>
  );
}
