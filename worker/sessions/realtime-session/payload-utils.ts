import type { RealtimeCardDTO, RealtimeFactDTO, RealtimeToolCallDTO } from '../../types';

const CARD_TYPES: ReadonlySet<RealtimeCardDTO['card_type']> = new Set([
  'text',
  'text_visual',
  'visual',
]);

export const safeJsonParse = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const clampTopK = (value: number): number => {
  const normalized = Number.isFinite(value) ? Math.floor(value) : 5;
  return Math.min(10, Math.max(1, normalized));
};

export const mapToolCallArguments = (
  args: unknown,
  callId: string
): RealtimeToolCallDTO | null => {
  if (!isRecord(args)) {
    return null;
  }

  if (typeof args.query === 'string') {
    const topKValue = typeof args.top_k === 'number' ? clampTopK(args.top_k) : 5;
    return {
      type: 'retrieve',
      callId,
      query: args.query,
      topK: topKValue,
    };
  }

  const card = mapCardFromRecord(args);
  if (card) {
    return {
      type: 'produce_card',
      callId,
      card,
    };
  }

  return null;
};

export const mapCardFromRecord = (
  record: Record<string, unknown>
): RealtimeCardDTO | null => {
  if (
    typeof record.kind !== 'string' ||
    typeof record.card_type !== 'string' ||
    typeof record.title !== 'string'
  ) {
    return null;
  }

  const cardType = CARD_TYPES.has(record.card_type as RealtimeCardDTO['card_type'])
    ? (record.card_type as RealtimeCardDTO['card_type'])
    : 'text';

  const sourceSeq = typeof record.source_seq === 'number' ? record.source_seq : 0;

  return {
    kind: record.kind,
    card_type: cardType,
    title: record.title,
    body: typeof record.body === 'string' ? record.body : null,
    label: typeof record.label === 'string' ? record.label : null,
    image_url: typeof record.image_url === 'string' ? record.image_url : null,
    source_seq: sourceSeq,
  };
};

export const mapCardPayload = (payload: unknown): RealtimeCardDTO | null => {
  if (!isRecord(payload)) {
    return null;
  }
  return mapCardFromRecord(payload);
};

const mapFactCandidate = (value: unknown): RealtimeFactDTO | null => {
  if (!isRecord(value) || typeof value.key !== 'string' || !('value' in value)) {
    return null;
  }

  const fact: RealtimeFactDTO = {
    key: value.key,
    value: value.value,
  };

  if (typeof value.confidence === 'number') {
    fact.confidence = value.confidence;
  }

  return fact;
};

export const mapFactsPayload = (payload: unknown): RealtimeFactDTO[] => {
  if (Array.isArray(payload)) {
    return payload
      .map(mapFactCandidate)
      .filter((fact): fact is RealtimeFactDTO => fact !== null);
  }

  if (isRecord(payload) && Array.isArray(payload.facts)) {
    return payload.facts
      .map(mapFactCandidate)
      .filter((fact): fact is RealtimeFactDTO => fact !== null);
  }

  return [];
};

export const extractErrorField = (
  value: unknown,
  field: 'message' | 'code' | 'type'
): string => {
  if (value instanceof Error && field === 'message') {
    return value.message;
  }
  if (isRecord(value)) {
    const fieldValue = value[field];
    if (typeof fieldValue === 'string') {
      return fieldValue;
    }
  }
  return '';
};

export const extractErrorMessage = (value: unknown): string => {
  const message = extractErrorField(value, 'message');
  if (message) {
    return message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return 'Unknown error';
  }
};
