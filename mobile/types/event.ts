export interface Event {
  id: string;
  owner_uid: string;
  title: string;
  topic: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

export type EventStatus = 'scheduled' | 'live' | 'ended';

export interface EventWithStatus extends Event {
  status: EventStatus;
}



