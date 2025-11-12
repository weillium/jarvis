import type { RealtimeFactDTO } from '../../types';
import type { Fact } from '../../state/facts-store';
import { computeFactSimilarity, FACT_SIMILARITY_THRESHOLD } from './similarity';

const GENERIC_KEY_TERMS = new Set([
  'topic',
  'topics',
  'discussion',
  'discussion_topic',
  'discussion_question',
  'question',
  'questions',
  'note',
  'notes',
  'fact',
  'facts',
  'item',
  'items',
  'detail',
  'details',
  'update',
  'updates',
  'summary',
  'info',
  'information',
  'point',
  'points',
  'idea',
  'ideas',
  'action',
  'actions',
  'task',
  'tasks',
  'comment',
  'comments',
  'observation',
  'observations',
]);

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'this',
  'that',
  'it',
  'as',
  'we',
  'you',
  'they',
  'their',
  'our',
  'current',
  'latest',
  'new',
  'today',
  'meeting',
  'call',
  'session',
  'discussion',
  'topic',
  'question',
  'update',
  'note',
  'fact',
  'summary',
]);

const toSnakeCase = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

const filterMeaningfulTokens = (tokens: string[]): string[] => {
  const seen = new Set<string>();
  const meaningful: string[] = [];
  for (const token of tokens) {
    if (token.length <= 2) {
      continue;
    }
    if (STOPWORDS.has(token)) {
      continue;
    }
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    meaningful.push(token);
  }
  return meaningful;
};

const hasMeaningfulKeyTokens = (key: string): boolean => {
  if (!key) {
    return false;
  }
  const parts = filterMeaningfulTokens(key.split('_'));
  return parts.length >= 2;
};

const deriveKeyFromString = (value: string): string | null => {
  const tokens = filterMeaningfulTokens(tokenize(value));
  if (tokens.length === 0) {
    return null;
  }
  const limited = tokens.slice(0, 5);
  return toSnakeCase(limited.join(' '));
};

const deriveKeyFromObject = (value: Record<string, unknown>): string | null => {
  const preferredFields = ['title', 'name', 'label', 'summary', 'description', 'topic'];
  for (const field of preferredFields) {
    const fieldValue = value[field];
    if (typeof fieldValue === 'string') {
      const derived = deriveKeyFromString(fieldValue);
      if (derived) {
        return derived;
      }
    }
  }
  // Fallback: find first string value
  for (const fieldValue of Object.values(value)) {
    if (typeof fieldValue === 'string') {
      const derived = deriveKeyFromString(fieldValue);
      if (derived) {
        return derived;
      }
    }
  }
  return null;
};

const deriveKeyFromValue = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return deriveKeyFromString(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        const derived = deriveKeyFromString(entry);
        if (derived) {
          return derived;
        }
      } else if (entry && typeof entry === 'object') {
        const derived = deriveKeyFromObject(entry as Record<string, unknown>);
        if (derived) {
          return derived;
        }
      }
    }
    return null;
  }
  if (value && typeof value === 'object') {
    return deriveKeyFromObject(value as Record<string, unknown>);
  }
  return null;
};

interface NormalizedFactKey {
  canonical: string;
  original: string;
  wasDerivedFromValue: boolean;
}

export const normalizeFactKey = (rawKey: string, rawValue: unknown): NormalizedFactKey => {
  const original = toSnakeCase(rawKey);
  const isGeneric = GENERIC_KEY_TERMS.has(original);
  const keyHasMeaning = hasMeaningfulKeyTokens(original);

  if (original && !isGeneric && keyHasMeaning) {
    return {
      canonical: original,
      original,
      wasDerivedFromValue: false,
    };
  }

  const derived = deriveKeyFromValue(rawValue);
  if (derived) {
    return {
      canonical: derived,
      original: original || derived,
      wasDerivedFromValue: true,
    };
  }

  // If the original was non-empty but generic, transform it into a minimal snake_case descriptive key
  if (original) {
    const fallbackTokens = filterMeaningfulTokens(original.split('_'));
    if (fallbackTokens.length >= 1) {
      const fallbackKey = toSnakeCase(fallbackTokens.join('_'));
      return {
        canonical: fallbackKey,
        original,
        wasDerivedFromValue: false,
      };
    }
  }

  return {
    canonical: 'general_fact',
    original: original || 'general_fact',
    wasDerivedFromValue: false,
  };
};

const DUPLICATE_SIMILARITY_THRESHOLD = 0.98;

export interface ValidatedFactInput {
  raw: RealtimeFactDTO;
  key: string;
  originalKey: string;
  value: unknown;
  confidence: number;
  derivedFromValue: boolean;
}

export const sanitizeFactValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return value.name ? `[Function ${value.name}]` : '[Function]';
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object') {
    return value;
  }

  return '';
};

export const validateRealtimeFact = (fact: RealtimeFactDTO): ValidatedFactInput | null => {
  if (!fact || typeof fact.key !== 'string') {
    return null;
  }

  const sanitizedValue = sanitizeFactValue(fact.value);
  if (typeof sanitizedValue === 'string' && sanitizedValue.length === 0) {
    return null;
  }

  const normalized = normalizeFactKey(fact.key, sanitizedValue);
  if (!normalized.canonical) {
    return null;
  }

  const confidence =
    typeof fact.confidence === 'number' && fact.confidence >= 0 && fact.confidence <= 1
      ? fact.confidence
      : 0.7;

  return {
    raw: fact,
    key: normalized.canonical,
    originalKey: normalized.original,
    value: sanitizedValue,
    confidence,
    derivedFromValue: normalized.wasDerivedFromValue,
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

