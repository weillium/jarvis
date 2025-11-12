import { normalizeFactValue, type NormalizedFactValue } from './value-normalizer';
import type { ClassifiedFact, FactKind } from './fact-types';

const QUESTION_REGEX = /(\?|^who\b|^what\b|^when\b|^where\b|^why\b|^how\b)/i;
const META_PREFIXES = [/^(let['’]?s|please|remember|note)/i, /^agenda:/i, /^housekeeping/i];

const MAX_REWRITE_TOKENS = 60;

export const classifyNormalizedFact = (normalized: NormalizedFactValue): ClassifiedFact => {
  const kind = detectKind(normalized);
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

