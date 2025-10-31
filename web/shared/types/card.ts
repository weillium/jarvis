export interface Card {
  id: string;
  event_id: string;
  emitted_at: string;
  kind: string | null;
  payload: Record<string, any> | null;
}

