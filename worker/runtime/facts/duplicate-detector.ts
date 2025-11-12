import type { Fact } from '../../state/facts-store';
import { computeFactSimilarity } from './similarity';
import { normalizeFactValue, type NormalizedFactValue } from './value-normalizer';

interface SimilarFactCandidate {
  key: string;
  fact: Fact;
  keySimilarity: number;
  factSimilarity: number;
}

const KEY_STOPWORDS = new Set([
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
  'update',
  'updates',
  'topic',
  'question',
  'note',
  'summary',
  'fact',
  'info',
  'information',
]);

const tokenizeKey = (key: string): string[] =>
  key
    .toLowerCase()
    .split('_')
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !KEY_STOPWORDS.has(token));

const jaccardSimilarity = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
};

const KEY_SIMILARITY_THRESHOLD = 0.5;
const FACT_SIMILARITY_THRESHOLD = 0.85;

export const findBestMatchingFact = (
  candidateKey: string,
  candidateFact: Fact,
  candidateNormalized: NormalizedFactValue,
  existingFacts: Fact[]
): SimilarFactCandidate | null => {
  const candidateHash = candidateNormalized.hash;
  const candidateFingerprint = candidateNormalized.fingerprint;
  const candidateTokens = new Set(tokenizeKey(candidateKey));
  let bestMatch: SimilarFactCandidate | null = null;

  for (const fact of existingFacts) {
    if (fact.fingerprintHash && fact.fingerprintHash === candidateFingerprint) {
      return {
        key: fact.key,
        fact,
        keySimilarity: 1,
        factSimilarity: 1,
      };
    }

    if (fact.normalizedHash && fact.normalizedHash === candidateHash) {
      return {
        key: fact.key,
        fact,
        keySimilarity: 1,
        factSimilarity: 1,
      };
    }

    const factTokens = new Set(tokenizeKey(fact.key));
    const keySimilarity = jaccardSimilarity(candidateTokens, factTokens);
    if (keySimilarity < KEY_SIMILARITY_THRESHOLD) {
      continue;
    }

    const normalizedExisting = normalizeFactValue(fact.value);
    const valueTokenSimilarity = jaccardSimilarity(
      new Set(candidateNormalized.tokens),
      new Set(normalizedExisting.tokens)
    );
    if (valueTokenSimilarity >= 0.85) {
      return {
        key: fact.key,
        fact,
        keySimilarity,
        factSimilarity: valueTokenSimilarity,
      };
    }

    const tripleMatch = tripleSimilarity(candidateNormalized.triple, {
      subject: fact.subject ?? null,
      predicate: fact.predicate ?? null,
      objects: fact.objects ?? null,
    });
    if (tripleMatch) {
      return {
        key: fact.key,
        fact,
        keySimilarity,
        factSimilarity: 0.9,
      };
    }

    const factSimilarity = Math.max(
      valueTokenSimilarity,
      computeFactSimilarity(fact, candidateFact)
    );
    if (factSimilarity < FACT_SIMILARITY_THRESHOLD) {
      continue;
    }

    if (!bestMatch || factSimilarity > bestMatch.factSimilarity) {
      bestMatch = {
        key: fact.key,
        fact,
        keySimilarity,
        factSimilarity,
      };
    }
  }

  return bestMatch;
};

const tripleSimilarity = (
  candidate: NormalizedFactValue['triple'],
  existing: { subject: string | null; predicate: string | null; objects: string[] | null }
): boolean => {
  if (!candidate) {
    return false;
  }
  if (!existing.subject || !existing.predicate || !existing.objects?.length) {
    return false;
  }

  if (candidate.subject !== existing.subject) {
    return false;
  }
  if (candidate.predicate !== existing.predicate) {
    return false;
  }

  const overlap = candidate.objects.filter((object) =>
    existing.objects!.includes(object)
  );

  return overlap.length > 0;
};

