export const REALTIME_CARD_KINDS = [
  'Decision',
  'Metric',
  'Deadline',
  'Topic',
  'Entity',
  'Action',
  'Context',
  'Definition',
] as const;

export type KnownRealtimeCardKind = (typeof REALTIME_CARD_KINDS)[number];

export type RealtimeCardKind =
  | KnownRealtimeCardKind
  | (string & { __unknownCardKind?: never });

export type RealtimeCardType = 'text' | 'text_visual' | 'visual';

export interface RealtimeCardDTO {
  kind: RealtimeCardKind;
  card_type: RealtimeCardType;
  title: string;
  body: string | null;
  label: string | null;
  image_url: string | null;
  source_seq: number;
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
