'use client';

import { useState } from 'react';
import { EventWithStatus } from '@/shared/types/event';
import { format, parseISO } from 'date-fns';
import { EditEventModal } from './edit-event-modal';
import { useEventDocsQuery } from '@/shared/hooks/use-event-docs-query';
import { useEventQuery } from '@/shared/hooks/use-event-query';
import { DocumentListItem } from './document-list-item';
import { YStack, XStack, Text, Card, Button } from '@jarvis/ui-core';

interface EventDetailProps {
  eventId: string;
  event?: EventWithStatus; // Optional: only used as fallback for initial render
  onEventUpdate?: (updatedEvent: EventWithStatus) => void;
}

export function EventDetail({ eventId, event, onEventUpdate }: EventDetailProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
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

  return (
    <YStack padding="$8">
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        marginBottom="$6"
        gap="$4"
      >
        <YStack flex={1}>
          <XStack alignItems="center" gap="$3" marginBottom="$3">
            <Text fontSize="$9" fontWeight="700" color="$color" margin={0}>
              {currentEvent.title}
            </Text>
            <YStack
              paddingHorizontal="$3"
              paddingVertical="$1.5"
              borderRadius="$5"
              backgroundColor={getStatusBgColor(currentEvent.status)}
            >
              <Text
                fontSize="$3"
                fontWeight="600"
                color={getStatusColor(currentEvent.status)}
              >
                {getStatusLabel(currentEvent.status)}
              </Text>
            </YStack>
          </XStack>
        </YStack>
        <Button
          variant="outline"
          size="sm"
          onPress={() => setIsEditModalOpen(true)}
        >
          Edit
        </Button>
      </XStack>

      {currentEvent.topic && (
        <Card
          variant="outlined"
          backgroundColor="$gray1"
          marginBottom="$6"
          padding="$4"
        >
          <YStack gap="$3">
            <Text
              fontSize="$3"
              fontWeight="600"
              color="$gray9"
              textTransform="uppercase"
              letterSpacing={0.5}
              margin={0}
            >
              Description
            </Text>
            <Text
              fontSize="$4"
              color="$gray9"
              lineHeight={1.6}
              whiteSpace="pre-wrap"
            >
              {currentEvent.topic}
            </Text>
          </YStack>
        </Card>
      )}

      {/* Event Documents Section */}
      <YStack marginBottom="$6">
        <Text
          fontSize="$3"
          fontWeight="600"
          color="$gray9"
          textTransform="uppercase"
          letterSpacing={0.5}
          marginBottom="$3"
        >
          Documents {docs && `(${docs.length})`}
        </Text>
        
        {docsLoading ? (
          <Text fontSize="$3" color="$gray11" margin={0}>
            Loading documents...
          </Text>
        ) : !docs || docs.length === 0 ? (
          <Text fontSize="$3" color="$gray11" margin={0}>
            No documents attached
          </Text>
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
        <YStack minWidth={200} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$2"
          >
            Start Time
          </Text>
          <Text fontSize="$4" fontWeight="500" color="$color">
            {formatDateTime(currentEvent.start_time)}
          </Text>
          {currentEvent.start_time && (
            <Text fontSize="$3" color="$gray11" marginTop="$1">
              {formatDate(currentEvent.start_time)}
            </Text>
          )}
        </YStack>

        <YStack minWidth={200} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$2"
          >
            End Time
          </Text>
          <Text fontSize="$4" fontWeight="500" color="$color">
            {formatDateTime(currentEvent.end_time)}
          </Text>
          {currentEvent.end_time && (
            <Text fontSize="$3" color="$gray11" marginTop="$1">
              {formatDate(currentEvent.end_time)}
            </Text>
          )}
        </YStack>

        <YStack minWidth={200} flex={1}>
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
            textTransform="uppercase"
            letterSpacing={0.5}
            marginBottom="$2"
          >
            Created
          </Text>
          <Text fontSize="$4" fontWeight="500" color="$color">
            {formatDate(currentEvent.created_at)}
          </Text>
          <Text fontSize="$3" color="$gray11" marginTop="$1">
            {formatDateTime(currentEvent.created_at)}
          </Text>
        </YStack>
      </XStack>

      <EditEventModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        event={currentEvent}
        onSuccess={(updatedEvent) => {
          // The mutation already invalidates the query, so React Query will automatically refetch
          // We just need to trigger the callback if provided
          if (onEventUpdate) {
            onEventUpdate(updatedEvent);
          }
        }}
      />
    </YStack>
  );
}

