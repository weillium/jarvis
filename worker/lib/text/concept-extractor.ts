import type { GlossaryEntry, TranscriptChunk, Fact } from '../../types';

export type ConceptMatchSource = 'glossary' | 'fact' | 'transcript';

export interface ConceptCandidate {
  conceptId: string;
  conceptLabel: string;
  matchSource: ConceptMatchSource;
  supportText: string;
  weight: number;
}

export interface ConceptExtractorInput {
  chunks: TranscriptChunk[];
  glossaryEntries?: Map<string, GlossaryEntry> | GlossaryEntry[];
  facts?: Fact[];
  contextBullets?: string[];
  existingConceptIds?: Iterable<string>;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'were',
  'will',
  'with',
  'we',
  'you',
  'your',
  'our',
]);

const PUNCTUATION_REGEX = /[^\p{L}\p{N}\s-]/gu;
const MULTISPACE_REGEX = /\s+/g;

const normalizeConceptId = (label: string): string => {
  return label
    .trim()
    .toLowerCase()
    .replace(PUNCTUATION_REGEX, '')
    .replace(MULTISPACE_REGEX, ' ')
    .replace(/\s+/g, '_');
};

const dedupeByConceptId = (candidates: ConceptCandidate[]): ConceptCandidate[] => {
  const seen = new Set<string>();
  const result: ConceptCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.weight - a.weight)) {
    if (seen.has(candidate.conceptId)) {
      continue;
    }
    seen.add(candidate.conceptId);
    result.push(candidate);
  }
  return result;
};

const collectGlossaryMatches = (
  text: string,
  glossary: Map<string, GlossaryEntry> | GlossaryEntry[] | undefined
): ConceptCandidate[] => {
  if (!glossary) {
    return [];
  }

  const entries: GlossaryEntry[] =
    glossary instanceof Map ? Array.from(glossary.values()) : glossary;

  return entries
    .filter((entry) => entry.term && text.toLowerCase().includes(entry.term.toLowerCase()))
    .map((entry) => ({
      conceptId: normalizeConceptId(entry.term),
      conceptLabel: entry.term,
      matchSource: 'glossary' as const,
      supportText: entry.definition || entry.term,
      weight: 1.0,
    }));
};

const collectFactMatches = (text: string, facts: Fact[] | undefined): ConceptCandidate[] => {
  if (!facts || facts.length === 0) {
    return [];
  }

  const lower = text.toLowerCase();
  return facts
    .filter((fact) => lower.includes(fact.key.toLowerCase()))
    .map((fact) => ({
      conceptId: normalizeConceptId(fact.key),
      conceptLabel: fact.key,
      matchSource: 'fact' as const,
      supportText: typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value),
      weight: 0.8,
    }));
};

const collectCapitalizedPhrases = (text: string): Set<string> => {
  const phrases = new Set<string>();
  const sentenceRegex = /([^.?!]+[.?!]?)/g;
  const candidateRegex = /\b([A-Z][\w-]*(?:\s+[A-Z][\w-]*)+)\b/g;

  const sentences = text.match(sentenceRegex) ?? [];
  for (const sentence of sentences) {
    let match: RegExpExecArray | null;
    while ((match = candidateRegex.exec(sentence)) !== null) {
      const phrase = match[1].trim();
      if (phrase.length > 2) {
        phrases.add(phrase);
      }
    }
  }

  return phrases;
};

const collectKeywordPhrases = (text: string): Set<string> => {
  const words = text
    .replace(PUNCTUATION_REGEX, ' ')
    .split(MULTISPACE_REGEX)
    .filter((word) => word.length > 2);

  const phrases = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    const current = words[i];
    if (!current) {
      continue;
    }
    const lower = current.toLowerCase();
    if (STOPWORDS.has(lower)) {
      continue;
    }

    const next = words[i + 1];
    if (next && !STOPWORDS.has(next.toLowerCase())) {
      const bigram = `${current} ${next}`.trim();
      phrases.add(bigram);
    } else {
      phrases.add(current);
    }
  }

  return phrases;
};

const buildTranscriptConcepts = (text: string): ConceptCandidate[] => {
  const capitalized = collectCapitalizedPhrases(text);
  const keywords = collectKeywordPhrases(text);

  const candidates = new Set<string>([...capitalized, ...keywords]);

  return Array.from(candidates)
    .filter((label) => label && label.length > 2)
    .map((label) => ({
      conceptId: normalizeConceptId(label),
      conceptLabel: label,
      matchSource: 'transcript' as const,
      supportText: label,
      weight: capitalized.has(label) ? 0.7 : 0.5,
    }));
};

const incorporateContextMatches = (
  contextBullets: string[] | undefined,
  candidates: ConceptCandidate[]
): ConceptCandidate[] => {
  if (!contextBullets || contextBullets.length === 0) {
    return candidates;
  }

  const augmented = [...candidates];
  const existingIds = new Set(candidates.map((candidate) => candidate.conceptId));

  for (const bullet of contextBullets) {
    const normalizedBullet = bullet.replace(/^-+\s*/, '').trim();
    if (!normalizedBullet) {
      continue;
    }

    const bulletConcepts = buildTranscriptConcepts(normalizedBullet);
    for (const concept of bulletConcepts) {
      if (existingIds.has(concept.conceptId)) {
        continue;
      }
      existingIds.add(concept.conceptId);
      augmented.push({
        ...concept,
        weight: Math.max(concept.weight, 0.6),
        supportText: normalizedBullet,
      });
    }
  }

  return augmented;
};

export const extractConcepts = (input: ConceptExtractorInput): ConceptCandidate[] => {
  const { chunks, glossaryEntries, facts, contextBullets, existingConceptIds } = input;
  if (!chunks || chunks.length === 0) {
    return [];
  }

  const windowText = chunks.map((chunk) => chunk.text).join(' ');

  const glossaryMatches = collectGlossaryMatches(windowText, glossaryEntries);
  const factMatches = collectFactMatches(windowText, facts);
  const transcriptConcepts = buildTranscriptConcepts(windowText);
  const withContext = incorporateContextMatches(contextBullets, transcriptConcepts);

  const combined = [...glossaryMatches, ...factMatches, ...withContext];
  const deduped = dedupeByConceptId(combined);

  if (!existingConceptIds) {
    return deduped;
  }

  const existing = new Set(Array.from(existingConceptIds).map((id) => id.toLowerCase()));
  return deduped.filter((candidate) => !existing.has(candidate.conceptId.toLowerCase()));
};

export const normalizeConcept = normalizeConceptId;


