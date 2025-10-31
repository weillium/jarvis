import { Event, EventStatus, EventWithStatus } from '@/shared/types/event';

export function mapDbEventToEvent(dbRow: any): Event {
  return {
    id: dbRow.id,
    owner_uid: dbRow.owner_uid,
    title: dbRow.title,
    topic: dbRow.topic,
    start_time: dbRow.start_time,
    end_time: dbRow.end_time,
    created_at: dbRow.created_at,
  };
}

export function calculateEventStatus(event: Event): EventStatus {
  const now = new Date();
  const startTime = event.start_time ? new Date(event.start_time) : null;
  const endTime = event.end_time ? new Date(event.end_time) : null;

  if (!startTime) {
    return 'scheduled';
  }

  if (endTime && now > endTime) {
    return 'ended';
  }

  if (startTime && now >= startTime && (!endTime || now <= endTime)) {
    return 'live';
  }

  return 'scheduled';
}

export function mapDbEventToEventWithStatus(dbRow: any): EventWithStatus {
  const event = mapDbEventToEvent(dbRow);
  return {
    ...event,
    status: calculateEventStatus(event),
  };
}

