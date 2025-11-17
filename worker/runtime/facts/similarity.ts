import type { Fact } from '../../state/facts-store';

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
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
  'this',
  'that',
  'it',
  'as',
  'we',
  'you',
  'they',
  'their',
  'our',
]);

export const FACT_SIMILARITY_THRESHOLD = DEFAULT_SIMILARITY_THRESHOLD;

const factToComparableText = (fact: Fact): string => {
  if (typeof fact.value === 'string') {
    return `${fact.key} ${fact.value}`;
  }

  try {
    return `${fact.key} ${JSON.stringify(fact.value)}`;
  } catch {
    return fact.key;
  }
};

const jaccardSimilarity = (setA: Set<string>, setB: Set<string>): number => {
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount += 1;
    }
  }

  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
};

const cosineSimilarity = (
  tokensA: Map<string, number>,
  tokensB: Map<string, number>,
  magnitudeA: number,
  magnitudeB: number
): number => {
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  let dotProduct = 0;
  for (const [token, countA] of tokensA) {
    const countB = tokensB.get(token);
    if (countB !== undefined) {
      dotProduct += countA * countB;
    }
  }

  return dotProduct / (magnitudeA * magnitudeB);
};

const buildTokenStats = (fact: Fact): { set: Set<string>; counts: Map<string, number>; magnitude: number } => {
  const comparable = factToComparableText(fact);
  const rawTokens = comparable
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));

  const counts = new Map<string, number>();
  for (const token of rawTokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  let magnitudeSq = 0;
  for (const count of counts.values()) {
    magnitudeSq += count * count;
  }

  return {
    set: new Set(counts.keys()),
    counts,
    magnitude: Math.sqrt(magnitudeSq),
  };
};

export const computeFactSimilarity = (factA: Fact, factB: Fact): number => {
  const statsA = buildTokenStats(factA);
  const statsB = buildTokenStats(factB);

  const jaccard = jaccardSimilarity(statsA.set, statsB.set);
  const cosine = cosineSimilarity(statsA.counts, statsB.counts, statsA.magnitude, statsB.magnitude);

  // Weighted blend to favor strict overlap while considering frequency patterns.
  return jaccard * 0.6 + cosine * 0.4;
};

export const groupSimilarFacts = (
  facts: Fact[],
  threshold: number = FACT_SIMILARITY_THRESHOLD
): Fact[][] => {
  if (facts.length === 0) {
    return [];
  }

  const tokenStats = facts.map((fact) => buildTokenStats(fact));
  const visited = new Set<number>();
  const clusters: Fact[][] = [];

  for (let i = 0; i < facts.length; i += 1) {
    if (visited.has(i)) {
      continue;
    }

    const queue: number[] = [i];
    visited.add(i);
    const clusterIndices: number[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      clusterIndices.push(current);

      for (let j = 0; j < facts.length; j += 1) {
        if (visited.has(j)) {
          continue;
        }

        const jaccard = jaccardSimilarity(tokenStats[current].set, tokenStats[j].set);
        if (jaccard < threshold) {
          continue;
        }

        // Additional cosine check to reduce false positives.
        const cosine = cosineSimilarity(
          tokenStats[current].counts,
          tokenStats[j].counts,
          tokenStats[current].magnitude,
          tokenStats[j].magnitude
        );

        const blended = jaccard * 0.6 + cosine * 0.4;
        if (blended >= threshold) {
          visited.add(j);
          queue.push(j);
        }
      }
    }

    const cluster = clusterIndices.map((index) => facts[index]);
    clusters.push(cluster);
  }

  return clusters;
};
