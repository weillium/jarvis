const CLAUSE_SPLIT_REGEX = /[.?!]\s+/;
const MIN_TOKEN_COUNT = 6;

const FILLER_PATTERNS: RegExp[] = [
  /^(?:uh|um|erm|hmm)\b/i,
  /^(?:okay|ok|alright|right)\b/i,
  /^(?:thanks?|thank you)\b/i,
  /^(?:hi|hello|hey)\b/i,
  /^(?:so|well)\b/i,
  /^(?:great|awesome|cool)\b/i,
  /^(?:yeah|yep|yup|nope)\b/i,
  /^(?:let'?s|we'?re)\s+(?:get|jump|move)\b/i,
  /^(?:i\s+mean|you\s+know)\b/i,
  /^(?:just\s+)\b/i,
];

const VERB_PATTERNS: RegExp[] = [
  /\b(?:is|are|was|were|be|been|being)\b/i,
  /\b(?:has|have|had)\b/i,
  /\b(?:does|do|did)\b/i,
  /\b(?:will|shall|should|can|could|would|may|might|must|needs?)\b/i,
  /\b(?:announces?|announced|plans?|planned|targets?|targeted|expects?|expected|reports?|reported|confirms?|confirmed)\b/i,
  /\b(?:launches?|launched|approves?|approved|agrees?|agreed|expands?|expanded|reduces?|reduced|increases?|increased)\b/i,
  /\b(?:take|takes|taking|consider|considers|considered)\b/i,
  /\b(?:remain|remains|remained|remaining)\b/i,
  /\b(?:drive|drives|driven|driving)\b/i,
];

const SUBJECT_PATTERNS: RegExp[] = [
  /\b(?:the\s+)?team\b/i,
  /\b(?:the\s+)?company\b/i,
  /\b(?:the\s+)?board\b/i,
  /\b(?:the\s+)?group\b/i,
  /\b(?:we|they|he|she|I)\b/i,
  /\b[A-Z]{2,}\b/,
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/,
];

const NORMALIZE_WHITESPACE_REGEX = /\s+/g;

const containsPattern = (value: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(value));

const looksLikeSentence = (candidate: string): boolean => {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (containsPattern(trimmed, FILLER_PATTERNS)) {
    return false;
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < MIN_TOKEN_COUNT) {
    return false;
  }

  if (!containsPattern(trimmed, VERB_PATTERNS)) {
    return false;
  }

  if (!containsPattern(trimmed, SUBJECT_PATTERNS)) {
    return false;
  }

  return true;
};

/**
 * Extracts declarative clauses from a transcript window and filters out
 * chit-chat, procedural chatter, and fragments that lack a clear subject-verb.
 */
export const filterTranscriptForFacts = (transcriptWindow: string): string => {
  if (!transcriptWindow || transcriptWindow.trim().length === 0) {
    return '';
  }

  const normalized = transcriptWindow.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const clauses = normalized.split(CLAUSE_SPLIT_REGEX);

  const filtered = clauses
    .map((clause) => clause.replace(NORMALIZE_WHITESPACE_REGEX, ' ').trim())
    .filter((clause) => looksLikeSentence(clause));

  if (filtered.length === 0) {
    return '';
  }

  const joined = filtered
    .map((clause) => {
      const punctuation = /[.?!]$/.test(clause) ? '' : '.';
      return `${clause}${punctuation}`;
    })
    .join(' ');

  return joined.trim();
};


