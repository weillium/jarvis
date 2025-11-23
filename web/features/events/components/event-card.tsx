'use client';

import { memo, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { EventWithStatus } from '@/shared/types/event';
import { format, parseISO } from 'date-fns';
import { XStack, YStack, Text, Card, ClampText } from '@jarvis/ui-core';

interface EventCardProps {
  event: EventWithStatus;
}

// Memoized helper functions
const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return 'Not scheduled';
  try {
    return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
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

export const EventCard = memo(function EventCard({ event }: EventCardProps) {
  const router = useRouter();

  // Memoize computed values
  const statusColor = useMemo(() => getStatusColor(event.status), [event.status]);
  const statusBgColor = useMemo(() => getStatusBgColor(event.status), [event.status]);
  const statusLabel = useMemo(() => getStatusLabel(event.status), [event.status]);
  const formattedStartTime = useMemo(() => formatDateTime(event.start_time), [event.start_time]);
  const formattedEndTime = useMemo(() => formatDateTime(event.end_time), [event.end_time]);
  const cleanedTopic = useMemo(() => {
    if (!event.topic) return null;
    return event.topic.replace(/[#*`]/g, '').substring(0, 150);
  }, [event.topic]);

  const handleClick = useCallback(() => {
    router.push(`/events/${event.id}/live`);
  }, [router, event.id]);

  return (
    <Card
      padding="$5"
      hoverStyle={{
        borderColor: '$borderColorHover',
        shadowColor: '$color',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 1,
      }}
      onClick={handleClick}
      cursor="pointer"
    >
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$4">
        <YStack flex={1} minWidth={0} gap="$2">
          <XStack alignItems="center" gap="$3" marginBottom="$2">
            <Text fontSize="$5" fontWeight="600" color="$color" margin={0}>
              {event.title}
            </Text>
            <YStack
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius="$4"
              backgroundColor={statusBgColor}
            >
              <Text
                fontSize="$2"
                fontWeight="500"
                color={statusColor}
              >
                {statusLabel}
              </Text>
            </YStack>
          </XStack>
          
          {cleanedTopic && (
            <ClampText
              lines={2}
              fontSize="$3"
              color="$gray11"
              marginBottom="$3"
            >
              {cleanedTopic}
              {event.topic && event.topic.length > 150 ? '...' : ''}
            </ClampText>
          )}

          <XStack gap="$6">
            <Text fontSize="$3" color="$gray11">
              <Text fontWeight="600" color="$gray9">Start:</Text>{' '}
              {formattedStartTime}
            </Text>
            {event.end_time && (
              <Text fontSize="$3" color="$gray11">
                <Text fontWeight="600" color="$gray9">End:</Text>{' '}
                {formattedEndTime}
              </Text>
            )}
          </XStack>
        </YStack>
      </XStack>
    </Card>
  );
});

