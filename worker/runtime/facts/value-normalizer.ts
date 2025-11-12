import crypto from 'node:crypto';

type Primitive = string | number | boolean | null;

export interface NormalizedFactValue {
  raw: unknown;
  normalized: Primitive | NormalizedObject | NormalizedArray;
  asString: string;
  hash: string;
  tokens: string[];
  numeric?: {
    value: number;
    unit?: string;
  };
}

type NormalizedObject = {
  type: 'object';
  entries: Array<[string, Primitive | NormalizedObject | NormalizedArray]>;
};

type NormalizedArray = {
  type: 'array';
  items: Array<Primitive | NormalizedObject | NormalizedArray>;
};

const NUMBER_WITH_UNIT = /^[$€£]?[-+]?\d[\d,]*(\.\d+)?\s*(m|million|k|thousand|b|billion|%)?$/i;

export const normalizeFactValue = (value: unknown): NormalizedFactValue => {
  const normalized = normalizeValue(value);
  const asString = serializeNormalized(normalized);
  const hash = hashNormalized(asString);
  const tokens = tokenize(asString);
  const numeric = extractNumeric(asString);

  return {
    raw: value,
    normalized,
    asString,
    hash,
    tokens,
    numeric,
  };
};

const normalizeValue = (value: unknown): Primitive | NormalizedObject | NormalizedArray => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return normalizeNumber(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return normalizeString(value);
  }

  if (Array.isArray(value)) {
    return normalizeArray(value);
  }

  if (typeof value === 'object') {
    return normalizeObject(value as Record<string, unknown>);
  }

  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);
};

const normalizeNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }
  return Math.round(value * 1e6) / 1e6;
};

const normalizeString = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (NUMBER_WITH_UNIT.test(trimmed)) {
    return normalizeNumericString(trimmed);
  }
  return collapseWhitespace(trimmed).toLowerCase();
};

const normalizeNumericString = (value: string): string => {
  const match = value.trim().toLowerCase();
  const unitMatch = match.match(/(m|million|k|thousand|b|billion|%)$/);
  const unit = unitMatch ? unitMatch[1] : undefined;
  const numericPart = match.replace(/[$€£]/g, '').replace(/(m|million|k|thousand|b|billion|%)$/i, '');
  const numericValue = Number(numericPart.replace(/,/g, ''));
  if (!Number.isFinite(numericValue)) {
    return collapseWhitespace(match);
  }
  const normalizedValue = normalizeNumber(scaleNumberByUnit(numericValue, unit));
  return unit ? `${normalizedValue}${unit}` : `${normalizedValue}`;
};

const scaleNumberByUnit = (value: number, unit?: string): number => {
  if (!unit) {
    return value;
  }

  switch (unit) {
    case 'k':
    case 'thousand':
      return value * 1e3;
    case 'm':
    case 'million':
      return value * 1e6;
    case 'b':
    case 'billion':
      return value * 1e9;
    case '%':
      return value / 100;
    default:
      return value;
  }
};

const normalizeArray = (value: unknown[]): NormalizedArray => {
  const items = value
    .map(normalizeValue)
    .filter((item): item is Primitive | NormalizedObject | NormalizedArray => item !== null);
  return {
    type: 'array',
    items,
  };
};

const normalizeObject = (value: Record<string, unknown>): NormalizedObject => {
  const entries: Array<[string, Primitive | NormalizedObject | NormalizedArray]> = [];

  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined) {
      continue;
    }
    const normalizedKey = collapseWhitespace(key).toLowerCase();
    const normalizedValue = normalizeValue(raw);
    if (normalizedValue === null || normalizedValue === '') {
      continue;
    }
    entries.push([normalizedKey, normalizedValue]);
  }

  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return {
    type: 'object',
    entries,
  };
};

const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const serializeNormalized = (
  value: Primitive | NormalizedObject | NormalizedArray
): string => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) ? '"nan"' : value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value.type === 'array') {
    return `[${value.items.map(serializeNormalized).join(',')}]`;
  }
  if (value.type === 'object') {
    return `{${value.entries
      .map(([key, val]) => `${JSON.stringify(key)}:${serializeNormalized(val)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const hashNormalized = (serialized: string): string =>
  crypto.createHash('sha1').update(serialized).digest('hex');

const REPORTING_SUBJECTS = new Set([
  'speaker',
  'moderator',
  'presenter',
  'panelist',
  'panelists',
  'participants',
  'attendees',
  'he',
  'she',
  'they',
  'we',
]);

const REPORTING_VERBS = new Set([
  'said',
  'asked',
  'noted',
  'stated',
  'emphasized',
  'highlighted',
  'shared',
  'added',
  'announced',
  'intends',
  'intend',
  'intended',
  'planned',
  'explained',
  'observed',
  'remarked',
]);

const tokenize = (input: string): string[] => {
  const rawTokens = input
    .toLowerCase()
    .split(/[^a-z0-9.%]+/g)
    .filter((token) => token.length > 0);

  const stripped = stripReportingTokens(rawTokens);
  return stripped
    .map(stemToken)
    .filter((token) => token.length > 0);
};

const stripReportingTokens = (tokens: string[]): string[] => {
  if (tokens.length === 0) {
    return tokens;
  }

  let index = 0;

  if (tokens[index] === 'the' && tokens.length > index + 1) {
    if (REPORTING_SUBJECTS.has(tokens[index + 1])) {
      index += 2;
    }
  } else if (REPORTING_SUBJECTS.has(tokens[index])) {
    index += 1;
  }

  if (index < tokens.length && REPORTING_VERBS.has(tokens[index])) {
    index += 1;
  }

  if (index < tokens.length && tokens[index] === 'that') {
    index += 1;
  }

  return tokens.slice(index);
};

const stemToken = (token: string): string => {
  if (token.length <= 3) {
    return token;
  }

  const suffixes = ['ing', 'ed', 'es', 's'];
  for (const suffix of suffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, -suffix.length);
    }
  }

  return token;
};

const extractNumeric = (
  serialized: string
): NormalizedFactValue['numeric'] => {
  const numericMatch = serialized.match(/^-?\d+(\.\d+)?(e[+-]?\d+)?/);
  if (!numericMatch) {
    return undefined;
  }
  const value = Number(numericMatch[0]);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const unitMatch = serialized.slice(numericMatch[0].length).match(/^(k|m|b|%)/);
  return {
    value,
    unit: unitMatch ? unitMatch[0] : undefined,
  };
};

