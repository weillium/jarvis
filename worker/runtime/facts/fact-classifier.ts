import { normalizeFactValue, type NormalizedFactValue } from './value-normalizer';
import type { ClassifiedFact, FactKind } from './fact-types';

const QUESTION_REGEX = /(\?|^who\b|^what\b|^when\b|^where\b|^why\b|^how\b)/i;
const META_PREFIXES = [/^(let['’]?s|please|remember|note)/i, /^agenda:/i, /^housekeeping/i];
const REPORTING_PATTERNS: RegExp[] = [
  /^(?:the\s+)?speaker\s+(?:said|asked|noted|stated|emphasized|highlighted|shared|added|announced|intends?|planned|explained)\s+(?:that\s+)?/i,
  /^(?:he|she|they)\s+(?:said|asked|noted|stated|emphasized|highlighted|shared|added|announced|intends?|planned|explained)\s+(?:that\s+)?/i,
  /^(?:participants|attendees|panelists|moderators?)\s+(?:said|asked|noted|stated|emphasized|highlighted|shared|added|announced|intends?|planned|explained)\s+(?:that\s+)?/i,
  /^(?:speaker|moderator)\s*:\s*/i,
];
const MAX_REWRITE_TOKENS = 60;

export const classifyNormalizedFact = (normalized: NormalizedFactValue): ClassifiedFact => {
  const kind = detectKind(normalized);

  const reportingRewrite = rewriteReportingScaffolding(normalized);
  if (reportingRewrite) {
    return {
      kind: 'claim',
      rewrittenValue: reportingRewrite,
    };
  }

  const atomicRewrite = enforceAtomicSentence(normalized);
  if (atomicRewrite) {
    return {
      kind: 'claim',
      rewrittenValue: atomicRewrite,
    };
  }

  if (kind === 'question') {
    const rewritten = rewriteQuestion(normalized);
    if (!rewritten) {
      return { kind: 'question', excludeFromPrompt: true };
    }
    return {
      kind: 'claim',
      rewrittenValue: rewritten,
    };
  }

  if (kind === 'meta') {
    const rewritten = rewriteMeta(normalized);
    if (!rewritten) {
      return { kind: 'meta', excludeFromPrompt: true };
    }
    return {
      kind: 'claim',
      rewrittenValue: rewritten,
    };
  }

  return { kind: 'claim' };
};

export const classifyRawFact = (value: unknown): ClassifiedFact => {
  const normalized = normalizeFactValue(value);
  return classifyNormalizedFact(normalized);
};

const detectKind = ({ asString, tokens }: NormalizedFactValue): FactKind => {
  if (QUESTION_REGEX.test(asString.trim()) || asString.trim().endsWith('?')) {
    return 'question';
  }

  if (META_PREFIXES.some((pattern) => pattern.test(asString))) {
    return 'meta';
  }

  if (tokens.length > MAX_REWRITE_TOKENS) {
    return 'meta';
  }

  return 'claim';
};

const rewriteQuestion = ({ asString }: NormalizedFactValue): string | null => {
  const trimmed = stripTrailing(asString.trim(), '?');
  if (trimmed.length === 0) {
    return null;
  }

  if (/^(who|what|when|where|why|how)\b/i.test(trimmed)) {
    return null;
  }

  if (/^do\s+we\b/i.test(trimmed)) {
    return trimmed.replace(/^do\s+we\b/i, 'the team').concat('.');
  }

  return null;
};

const rewriteMeta = ({ asString }: NormalizedFactValue): string | null => {
  const trimmed = asString.trim();
  const directiveMatch = trimmed.match(/^let['’]?s\s+(.*)$/i);
  if (directiveMatch) {
    return `planned action: ${directiveMatch[1]}`;
  }

  if (/^agenda:/i.test(trimmed)) {
    return trimmed.replace(/^agenda:\s*/i, 'agenda item: ');
  }

  return null;
};

const stripTrailing = (value: string, char: string): string => {
  if (value.endsWith(char)) {
    return value.slice(0, -char.length);
  }
  return value;
};

const rewriteReportingScaffolding = (normalized: NormalizedFactValue): string | null => {
  if (typeof normalized.raw !== 'string') {
    return null;
  }
  let candidate = normalized.raw.trim();
  let changed = false;

  for (const pattern of REPORTING_PATTERNS) {
    if (pattern.test(candidate)) {
      candidate = candidate.replace(pattern, '');
      changed = true;
      break;
    }
  }

  if (!changed) {
    return null;
  }

  candidate = candidate.replace(/^["'“”]+/, '').trim();
  if (!candidate) {
    return null;
  }

  candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
  if (!/[.!?]$/.test(candidate)) {
    candidate = `${candidate}.`;
  }
  return candidate;
};

const enforceAtomicSentence = (normalized: NormalizedFactValue): string | null => {
  if (typeof normalized.raw !== 'string') {
    return null;
  }
  const text = normalized.raw.trim();
  if (!text || !/[;]| and | but /i.test(text)) {
    return null;
  }

  const firstClause = text.split(/(?:\.\s+|;\s+|\s+and\s+(?=[A-Z]))/)[0]?.trim();
  if (!firstClause || firstClause.length === text.length) {
    return null;
  }

  const normalizedClause = firstClause.replace(/[;]+$/, '').trim();
  if (!normalizedClause) {
    return null;
  }

  const sentence = /[.!?]$/.test(normalizedClause) ? normalizedClause : `${normalizedClause}.`;
  return sentence;
};

