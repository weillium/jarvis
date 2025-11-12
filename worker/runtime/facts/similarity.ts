import type { Fact } from '../../state/facts-store';

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
};

const buildFrequencyMap = (tokens: string[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
};

const cosineSimilarity = (a: Map<string, number>, b: Map<string, number>): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  a.forEach((value, key) => {
    normA += value * value;
    if (b.has(key)) {
      dot += value * (b.get(key) ?? 0);
    }
  });

  b.forEach((value) => {
    normB += value * value;
  });

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const jaccardSimilarity = (aTokens: string[], bTokens: string[]): number => {
  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  let intersection = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) {
      intersection += 1;
    }
  });

  const union = aSet.size + bSet.size - intersection;
  if (union === 0) {
    return 0;
  }

  return intersection / union;
};

const factToText = (fact: Fact): string => {
  if (typeof fact.value === 'string') {
    return `${fact.key}: ${fact.value}`;
  }
  try {
    return `${fact.key}: ${JSON.stringify(fact.value)}`;
  } catch {
    return fact.key;
  }
};

export interface FactCluster {
  representative: Fact;
  members: Fact[];
  similarity: number;
}

export const computeFactSimilarity = (a: Fact, b: Fact): number => {
  const aTokens = tokenize(factToText(a));
  const bTokens = tokenize(factToText(b));

  const cosine = cosineSimilarity(buildFrequencyMap(aTokens), buildFrequencyMap(bTokens));
  const jaccard = jaccardSimilarity(aTokens, bTokens);

  // Weighted average favoring cosine but keeping jaccard in play
  return cosine * 0.7 + jaccard * 0.3;
};

export const groupSimilarFacts = (
  facts: Fact[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): FactCluster[] => {
  const visited = new Set<string>();
  const clusters: FactCluster[] = [];

  for (const fact of facts) {
    if (visited.has(fact.key)) {
      continue;
    }

    const clusterMembers: Fact[] = [];
    let bestRepresentative = fact;
    visited.add(fact.key);

    for (const other of facts) {
      if (other.key === fact.key || visited.has(other.key)) {
        continue;
      }

      const similarity = computeFactSimilarity(fact, other);
      if (similarity >= threshold) {
        clusterMembers.push(other);
        visited.add(other.key);
        // Prefer representative with higher confidence or recency
        if (
          other.confidence > bestRepresentative.confidence ||
          (other.confidence === bestRepresentative.confidence && other.lastSeenSeq > bestRepresentative.lastSeenSeq)
        ) {
          bestRepresentative = other;
        }
      }
    }

    if (clusterMembers.length === 0) {
      clusters.push({
        representative: fact,
        members: [],
        similarity: 1,
      });
    } else {
      clusters.push({
        representative: bestRepresentative,
        members: clusterMembers,
        similarity: 1,
      });
    }
  }

  return clusters;
};

export const FACT_SIMILARITY_THRESHOLD = DEFAULT_SIMILARITY_THRESHOLD;

