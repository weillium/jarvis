import type { RealtimeFactDTO } from '../../types';
import type { Fact } from '../../state/facts-store';
import { computeFactSimilarity, FACT_SIMILARITY_THRESHOLD } from './similarity';

const DUPLICATE_SIMILARITY_THRESHOLD = 0.98;

export interface ValidatedFactInput {
  raw: RealtimeFactDTO;
  key: string;
  value: unknown;
  confidence: number;
}

export const normalizeFactKey = (rawKey: string): string => {
  return rawKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

export const sanitizeFactValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value;
  }
  return String(value ?? '');
};

export const validateRealtimeFact = (fact: RealtimeFactDTO): ValidatedFactInput | null => {
  if (!fact || typeof fact.key !== 'string') {
    return null;
  }

  const normalizedKey = normalizeFactKey(fact.key);
  if (!normalizedKey) {
    return null;
  }

  const sanitizedValue = sanitizeFactValue(fact.value);
  if (typeof sanitizedValue === 'string' && sanitizedValue.length === 0) {
    return null;
  }

  const confidence =
    typeof fact.confidence === 'number' && fact.confidence >= 0 && fact.confidence <= 1
      ? fact.confidence
      : 0.7;

  return {
    raw: fact,
    key: normalizedKey,
    value: sanitizedValue,
    confidence,
  };
};

export const factsAreEquivalent = (existing: Fact, incomingValue: unknown): boolean => {
  try {
    return JSON.stringify(existing.value) === JSON.stringify(incomingValue);
  } catch {
    return false;
  }
};

export const computeIngestSimilarity = (existing: Fact, candidate: Fact): number => {
  return computeFactSimilarity(existing, candidate);
};

export const shouldTreatAsDuplicate = (similarity: number): boolean => {
  return similarity >= DUPLICATE_SIMILARITY_THRESHOLD;
};

export const shouldTreatAsMerge = (similarity: number): boolean => {
  return similarity >= FACT_SIMILARITY_THRESHOLD;
};

