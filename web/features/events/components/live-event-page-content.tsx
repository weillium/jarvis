'use client';

import Link from 'next/link';
import type { EventWithStatus } from '@/shared/types/event';
import { LiveEventTabs } from './live-event-tabs';
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
  if (!event) {
    return (
      <PageContainer>
        <Card padding="$6" alignItems="center" gap="$3">
          <Heading level={4}>Event Not Found</Heading>
          <Body tone="muted" align="center">
            {error || 'The event you are looking for does not exist or you do not have access to it.'}
          </Body>
          <Button asChild>
            <Link href="/events">Back to Events</Link>
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <YStack gap="$3">
        <Button asChild variant="ghost" size="sm" alignSelf="flex-start">
          <Link href="/events">← Back to Events</Link>
        </Button>
        <PageHeader>
          <Heading level={3}>Live Event View</Heading>
          <Body tone="muted">Monitor live status and agent activity</Body>
        </PageHeader>
      </YStack>
      <LiveEventTabs event={event} eventId={eventId} />
    </PageContainer>
  );
}
