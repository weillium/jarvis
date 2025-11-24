'use client';

import { EventWithStatus } from '@/shared/types/event';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useEventDocsQuery } from '@/shared/hooks/use-event-docs-query';
import { useEventQuery } from '@/shared/hooks/use-event-query';
import { DocumentListItem } from './document-list-item';
import {
  YStack,
  XStack,
  Card,
  Button,
  Heading,
  Body,
  Label,
  Badge,
  EmptyStateCard,
  LoadingState,
} from '@jarvis/ui-core';

interface EventDetailProps {
  eventId: string;
  event?: EventWithStatus; // Optional: only used as fallback for initial render
  onEventUpdate?: (updatedEvent: EventWithStatus) => void;
}

export function EventDetail({ eventId, event, onEventUpdate }: EventDetailProps) {
  const router = useRouter();
  
  // Fetch event data using React Query - this will automatically refetch when invalidated
  const { data: eventData, isLoading: eventLoading } = useEventQuery(eventId);
  
  // Use fetched data if available, otherwise fall back to prop (for initial render)
  const currentEvent = eventData || event;
  
  // Fetch event documents
  const { data: docs, isLoading: docsLoading } = useEventDocsQuery(eventId);
  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return 'Not scheduled';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Not scheduled';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusColor = (status: EventWithStatus['status']) => {
    switch (status) {
      case 'live':
        return '$green11';
      case 'scheduled':
        return '$blue6';
      case 'ended':
        return '$gray11';
      default:
        return '$gray11';
    }
  };

  const getStatusBgColor = (status: EventWithStatus['status']) => {
    switch (status) {
      case 'live':
        return '$green2';
      case 'scheduled':
        return '$blue2';
      case 'ended':
        return '$gray2';
      default:
        return '$gray2';
    }
  };

  const getStatusLabel = (status: EventWithStatus['status']): string => {
    switch (status) {
      case 'live':
        return 'Live';
      case 'scheduled':
        return 'Scheduled';
      case 'ended':
        return 'Ended';
      default:
        return 'Unknown';
    }
  };

  if (!currentEvent) {
    return (
      <LoadingState
        title="Loading event details"
        description="Fetching the latest event information."
      />
    );
  }

  return (
    <YStack padding="$8" gap="$6">
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap="$4"
        flexWrap="wrap"
      >
        <YStack flex={1}>
          <XStack alignItems="center" gap="$3" marginBottom="$3" flexWrap="wrap">
            <Heading level={1}>{currentEvent.title}</Heading>
            <Badge
              variant="gray"
              size="sm"
              backgroundColor={getStatusBgColor(currentEvent.status)}
              color={getStatusColor(currentEvent.status)}
            >
              {getStatusLabel(currentEvent.status)}
            </Badge>
          </XStack>
        </YStack>
        <Button
          variant="outline"
          size="sm"
          onPress={() => router.push(`/events/${eventId}/edit`)}
        >
          Edit
        </Button>
      </XStack>

      {currentEvent.topic && (
        <Card
          variant="outlined"
          backgroundColor="$gray1"
          padding="$4"
          width="100%"
        >
          <YStack gap="$3" width="100%">
            <Label>Description</Label>
            <Body whitespace="preWrap">
              {currentEvent.topic}
            </Body>
          </YStack>
        </Card>
      )}

      {/* Event Documents Section */}
      <YStack marginBottom="$6">
        <Label>
          Documents {docs && `(${docs.length})`}
        </Label>
        
        {docsLoading ? (
          <LoadingState
            title="Loading documents"
            description="Fetching any files attached to this event."
          />
        ) : !docs || docs.length === 0 ? (
          <EmptyStateCard
            title="No documents attached"
            description="Upload reference documents in the event settings."
            padding="$4"
            borderRadius="$3"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$gray1"
            align="start"
            titleLevel={5}
          />
        ) : (
          <YStack>
            {docs.map((doc) => (
              <DocumentListItem
                key={doc.id}
                doc={doc}
              />
            ))}
          </YStack>
        )}
      </YStack>

      <XStack
        flexWrap="wrap"
        gap="$6"
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        <YStack minWidth={200} flex={1} gap="$2">
          <Label size="xs">Start Time</Label>
          <Body size="lg" weight="medium">
            {formatDateTime(currentEvent.start_time)}
          </Body>
          {currentEvent.start_time && (
            <Body tone="muted" size="sm">
              {formatDate(currentEvent.start_time)}
            </Body>
          )}
        </YStack>

        <YStack minWidth={200} flex={1} gap="$2">
          <Label size="xs">End Time</Label>
          <Body size="lg" weight="medium">
            {formatDateTime(currentEvent.end_time)}
          </Body>
          {currentEvent.end_time && (
            <Body tone="muted" size="sm">
              {formatDate(currentEvent.end_time)}
            </Body>
          )}
        </YStack>

        <YStack minWidth={200} flex={1} gap="$2">
          <Label size="xs">Created</Label>
          <Body size="lg" weight="medium">
            {formatDate(currentEvent.created_at)}
          </Body>
          <Body tone="muted" size="sm">
            {formatDateTime(currentEvent.created_at)}
          </Body>
        </YStack>
      </XStack>
    </YStack>
  );
}
