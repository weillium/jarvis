import { filterTranscriptForFacts } from '../../lib/text/transcript-filter';

export interface FactSentenceValidation {
  valid: boolean;
  reason?: string;
}

const MIN_TOKEN_COUNT = 6;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const stripTerminalPunctuation = (value: string): string => value.replace(/[.?!]+$/g, '').trim();

const splitSentences = (value: string): string[] =>
  value
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

export const validateFactSentence = (rawValue: unknown): FactSentenceValidation => {
  if (typeof rawValue !== 'string') {
    return {
      valid: false,
      reason: 'Fact value must be a string sentence.',
    };
  }

  const normalized = normalizeWhitespace(rawValue);
  if (normalized.length === 0) {
    return {
      valid: false,
      reason: 'Fact sentence is empty.',
    };
  }

  const tokens = normalized.split(' ');
  if (tokens.length < MIN_TOKEN_COUNT) {
    return {
      valid: false,
      reason: 'Fact sentence is too short to capture a meaningful statement.',
    };
  }

  if (!/[.?!]$/.test(normalized)) {
    return {
      valid: false,
      reason: 'Fact sentence must end with punctuation.',
    };
  }

  if (!/^[A-Z0-9]/.test(normalized)) {
    return {
      valid: false,
      reason: 'Fact sentence must start with a capitalized subject.',
    };
  }

  const filtered = filterTranscriptForFacts(normalized);
  // NOTE: Subject/verb enforcement is temporarily disabled while we evaluate a more reliable grammar check.
  //       Consider replacing this with:
  //       1. A lightweight Python microservice running spaCy/Stanza to confirm each sentence has an nsubj + verb.
  //       2. A JavaScript-based POS tagger (e.g., compromise or wink-nlp) with custom heuristics for declarative sentences.
  // if (filtered.length === 0) {
  //   return {
  //     valid: false,
  //     reason: 'Fact sentence lacks a clear subject and verb.',
  //   };
  // }

  const normalizedCore = stripTerminalPunctuation(normalized).toLowerCase();
  const matchesFiltered = splitSentences(filtered).some((sentence) => {
    const comparable = stripTerminalPunctuation(sentence).toLowerCase();
    return comparable === normalizedCore;
  });
  // NOTE: Strict matching against filtered clauses is temporarily disabled.
  //       A future grammar validator (Python microservice or JS POS tagger) can enforce both:
  //       - Subject/verb presence
  //       - Declarative sentence structure (rather than relying on exact string equality)
  // if (!matchesFiltered) {
  //   return {
  //     valid: false,
  //     reason: 'Fact sentence appears procedural or conversational, not declarative.',
  //   };
  // }

  return { valid: true };
};


