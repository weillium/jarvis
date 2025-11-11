export interface Card {
  id: string;
  event_id: string;
  emitted_at: string;
  kind: string | null;
  payload: Record<string, any> | null;
  is_active: boolean;
}

export type CardType = 'text' | 'text_visual' | 'visual';

export interface CardPayload {
  kind: string;
  card_type: CardType;
  title: string;
  body?: string | null;
  label?: string | null;
  image_url?: string | null;
  source_seq?: number;
}

export interface SSECardMessage {
  type: 'card';
  id?: string;
  payload: CardPayload;
  for_seq?: number;
  created_at: string;
  timestamp: string;
  is_active?: boolean;
}

export interface SSEFactMessage {
  type: 'fact_update';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: {
    event_id: string;
    fact_key: string;
    fact_value: any;
    confidence: number;
    last_seen_seq: number;
    sources: number[];
    updated_at: string;
  };
  timestamp: string;
}

export interface SSEConnectedMessage {
  type: 'connected';
  event_id: string;
  timestamp: string;
}

export interface SSEHeartbeatMessage {
  type: 'heartbeat';
  timestamp: string;
}

export type SSEMessage = SSECardMessage | SSEFactMessage | SSEConnectedMessage | SSEHeartbeatMessage;

