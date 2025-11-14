import type { CardVisualRequest } from '../sessions/agent-profiles/cards/runtime-tooling/card-image-service';

export type RealtimeCardType = 'text' | 'text_visual' | 'visual';

export interface RealtimeCardDTO {
  card_type: RealtimeCardType;
  title: string;
  body: string | null;
  label: string | null;
  image_url: string | null;
  visual_request?: CardVisualRequest | null;
  source_seq: number;
  template_id?: string | null;
  template_label?: string | null;
}

export interface RealtimeRetrieveToolCallDTO {
  type: 'retrieve';
  callId: string;
  query: string;
  topK: number;
}

export interface RealtimeProduceCardToolCallDTO {
  type: 'produce_card';
  callId: string;
  card: RealtimeCardDTO;
}

export type RealtimeToolCallDTO =
  | RealtimeRetrieveToolCallDTO
  | RealtimeProduceCardToolCallDTO;

export interface RealtimeFactDTO {
  key: string;
  value: unknown;
  confidence?: number;
  [key: string]: unknown;
}

export interface RealtimeTranscriptDTO {
  text: string;
  isFinal: boolean;
  receivedAt: string;
  usage?: RealtimeTranscriptionUsageDTO;
}

export interface RealtimeModelResponseDTO {
  raw: unknown;
}

export interface RealtimeTranscriptionUsageDTO {
  type: 'tokens';
  total_tokens: number;
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: {
    audio_tokens?: number;
    text_tokens?: number;
  };
}
