export type CardType = 'text' | 'text_visual' | 'visual';

export interface Card {
  id: string;
  event_id: string;
  emitted_at: string;
  kind: string | null;
  payload: Record<string, any> | null;
  is_active: boolean;
  card_type?: CardType | null;
  updated_at?: string;
  last_seen_seq?: number | null;
}

export interface CardVisualRequest {
  strategy: 'fetch' | 'generate';
  instructions: string;
  source_url?: string | null;
}

export interface CardPayload {
  kind?: string | null;
  card_type: CardType;
  title: string;
  body?: string | null;
  label?: string | null;
  image_url?: string | null;
  visual_request?: CardVisualRequest | null;
  source_seq?: number;
  template_id?: string | null;
  template_label?: string | null;
}

export interface CardSnapshot {
  id: string;
  event_id: string;
  payload: Record<string, any>;
  card_kind: string | null;
  card_type?: CardType | null;
  created_at: string;
  updated_at?: string | null;
  last_seen_seq?: number | null;
  is_active: boolean;
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

export interface SSECardCreatedMessage {
  type: 'card_created';
  timestamp: string;
  card: CardSnapshot;
}

export interface SSECardUpdatedMessage {
  type: 'card_updated';
  timestamp: string;
  card: CardSnapshot;
}

export interface SSECardDeactivatedMessage {
  type: 'card_deactivated';
  timestamp: string;
  card_id: string;
}

export interface SSECardDeletedMessage {
  type: 'card_deleted';
  timestamp: string;
  card_id: string;
}

export type SSEMessage =
  | SSECardCreatedMessage
  | SSECardUpdatedMessage
  | SSECardDeactivatedMessage
  | SSECardDeletedMessage
  | SSEFactMessage
  | SSEConnectedMessage
  | SSEHeartbeatMessage;

export type CardAuditAction = 'deactivated' | 'reactivated' | 'updated';

export interface CardAuditLogEntry {
  id: string;
  event_id: string;
  card_id: string;
  action: CardAuditAction;
  actor_id: string;
  reason: string | null;
  payload_before: Record<string, any> | null;
  payload_after: Record<string, any> | null;
  created_at: string;
}

