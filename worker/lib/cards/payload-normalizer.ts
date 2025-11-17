import type { CardStateRecord } from '../../types';
import type { CardRecord } from '../../state/cards-store';
import { isRecord } from '../context-normalization';

const CARD_TYPE_VALUES = ['text', 'text_visual', 'visual'] as const;
const CARD_TYPE_SET = new Set<string>(CARD_TYPE_VALUES);
type CardType = CardRecord['cardType'];

const toFiniteInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
};

const getNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const getNullableString = (value: unknown): string | null | undefined => {
  if (value === null) {
    return null;
  }
  return getOptionalString(value);
};

const isRealtimeCardType = (value: unknown): value is CardType =>
  typeof value === 'string' && CARD_TYPE_SET.has(value);

export const normalizeCardStateRecord = (
  card: CardStateRecord,
  now: number = Date.now()
): CardRecord | null => {
  const payloadCandidate = card.payload;
  if (!isRecord(payloadCandidate)) {
    return null;
  }

  const payload = payloadCandidate;
  const conceptId = getNonEmptyString(payload.concept_id) ?? card.card_id;
  const conceptLabel =
    getNonEmptyString(payload.concept_label) ??
    getNonEmptyString(payload.title) ??
    'Card';

  const cardTypeRaw = payload.card_type;
  const cardType: CardType = isRealtimeCardType(cardTypeRaw) ? cardTypeRaw : 'text';

  const sourceSeq =
    toFiniteInteger(card.source_seq) ??
    toFiniteInteger(card.last_seen_seq) ??
    0;

  const isoTimestamp =
    getOptionalString(card.updated_at) ??
    getOptionalString(card.created_at) ??
    null;
  const parsedTimestamp = isoTimestamp ? Date.parse(isoTimestamp) : Number.NaN;
  const createdAt = Number.isFinite(parsedTimestamp) ? parsedTimestamp : now;

  const title = getOptionalString(payload.title);
  const body = getNullableString(payload.body);
  const label = getNullableString(payload.label);
  const imageUrl = getNullableString(payload.image_url);
  const templateId = getNullableString(payload.template_id);
  const templateLabel = getNullableString(payload.template_label);

  const metadata: CardRecord['metadata'] = {
    agentOutputId: card.card_id,
  };

  if (title !== undefined) {
    metadata.title = title;
  }
  if (templateId !== undefined) {
    metadata.templateId = templateId;
  }
  if (templateLabel !== undefined) {
    metadata.templateLabel = templateLabel;
  }
  if (body !== undefined) {
    metadata.body = body;
  }
  if (label !== undefined) {
    metadata.label = label;
  }
  if (imageUrl !== undefined) {
    metadata.imageUrl = imageUrl;
  }

  return {
    conceptId,
    conceptLabel,
    cardType,
    sourceSeq,
    createdAt,
    metadata,
  };
};

