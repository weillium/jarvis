import { config } from '../config';
import type { SqlHit } from './sqlSearch';
import type { VecHit } from './vecSearch';
import type { WebSnippet } from './webRag';

export interface RetrievalSignals {
  sql: SqlHit[];
  vec: VecHit[];
  web: WebSnippet[];
  topicAlignment?: number;
}

export interface RetrievalScore {
  score: number;
  composeLocal: boolean;
  shouldTryWeb: boolean;
  components: {
    fts: number;
    vec: number;
    entityOverlap: number;
    topicAlignment: number;
  };
}

export function computeRetrievalScore(signals: RetrievalSignals): RetrievalScore {
  const { weights, thresholds } = config.retrieval;
  const ftsNorm = normalizeFts(signals.sql);
  const vecScore = normalizeVec(signals.vec);
  const entityOverlap = estimateEntityOverlap(signals.sql, signals.vec);
  const topicAlignment = clamp(signals.topicAlignment ?? 0, 0, 1);
  const score = weights.w1 * ftsNorm + weights.w2 * vecScore + weights.w3 * entityOverlap + weights.w4 * topicAlignment;
  return {
    score,
    composeLocal: score >= thresholds.composeLocal,
    shouldTryWeb: score >= thresholds.tryWebMin && score <= thresholds.tryWebMax,
    components: { fts: ftsNorm, vec: vecScore, entityOverlap, topicAlignment }
  };
}

function normalizeFts(hits: SqlHit[]): number {
  if (!hits.length) return 0;
  const scores = hits.map((hit) => hit.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  if (maxScore === minScore) return 1;
  return clamp(1 - (minScore / (maxScore || 1)), 0, 1);
}

function normalizeVec(hits: VecHit[]): number {
  if (!hits.length) return 0;
  const scores = hits.map((hit) => hit.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return clamp(1 - min, -1, 1);
  const norm = (max - scores[0]) / (max - min);
  return clamp(norm, 0, 1);
}

function estimateEntityOverlap(sqlHits: SqlHit[], vecHits: VecHit[]): number {
  if (!sqlHits.length || !vecHits.length) return 0;
  const sqlTitles = new Set(sqlHits.map((hit) => hit.title.toLowerCase()));
  let overlap = 0;
  for (const hit of vecHits) {
    const normalized = hit.text.toLowerCase();
    for (const title of sqlTitles) {
      if (normalized.includes(title)) {
        overlap += 1;
        break;
      }
    }
  }
  const denom = Math.max(sqlHits.length, 1);
  return clamp(overlap / denom, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
