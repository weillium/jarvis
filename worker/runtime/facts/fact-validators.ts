export interface FactSentenceValidation {
  valid: boolean;
  reason?: string;
}

const MIN_TOKEN_COUNT = 6;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

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

  // NOTE: Advanced grammar validation (subject/verb detection, declarative sentence enforcement) is temporarily
  //       disabled while we evaluate more reliable strategies (spaCy/Stanza service, JS POS taggers, etc.).

  return { valid: true };
};


