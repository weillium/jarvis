import type { ConceptCandidate } from '../../lib/text/concept-extractor';
import type { TranscriptChunk, EventRuntime } from '../../types';

export interface CardSalienceComponents {
  baseWeight: number;
  firstMention: number;
  mentionBonus: number;
  questionBoost: number;
  glossaryBoost: number;
  factBoost: number;
  visiblePenalty: number;
  suppressionPenalty: number;
}

export interface CardSalienceResult {
  score: number;
  components: CardSalienceComponents;
}

const BASE_WEIGHT = Number(process.env.CARDS_SALIENCE_BASE_WEIGHT ?? 2);
const FIRST_MENTION_BONUS = Number(process.env.CARDS_SALIENCE_FIRST_MENTION_BONUS ?? 2);
const MENTION_BONUS_CAP = Number(process.env.CARDS_SALIENCE_MENTION_BONUS_CAP ?? 2);
const QUESTION_BONUS = Number(process.env.CARDS_SALIENCE_QUESTION_BONUS ?? 1);
const GLOSSARY_BONUS = Number(process.env.CARDS_SALIENCE_GLOSSARY_BONUS ?? 1);
const FACT_BONUS = Number(process.env.CARDS_SALIENCE_FACT_BONUS ?? 0.5);
const VISIBLE_PENALTY = Number(process.env.CARDS_SALIENCE_VISIBLE_PENALTY ?? 1);
const VISIBLE_STRONG_PENALTY = Number(process.env.CARDS_SALIENCE_VISIBLE_STRONG_PENALTY ?? 3);
const SUPPRESSION_PENALTY = Number(process.env.CARDS_SALIENCE_SUPPRESSION_PENALTY ?? 0);

const QUESTION_TERMS = (
  process.env.CARDS_SALIENCE_QUESTION_TERMS ??
  'who,what,when,where,why,how,should,would,could,can,will,do,does,did'
)
  .split(',')
  .map((term) => term.trim().toLowerCase())
  .filter(Boolean);

export const CARD_SALIENCE_THRESHOLD = Number(process.env.CARDS_SALIENCE_THRESHOLD ?? 2.5);

export function computeCardSalience(input: {
  candidate: ConceptCandidate;
  runtime: EventRuntime;
  recentChunks: TranscriptChunk[];
  occurrences: number;
  freshnessMs: number;
  recentLimit: number;
}): CardSalienceResult {
  const { candidate, runtime, recentChunks, occurrences, freshnessMs, recentLimit } = input;

  const baseWeight = candidate.weight * BASE_WEIGHT;

  const firstMention = runtime.cardsStore.hasRecentConcept(candidate.conceptId, freshnessMs)
    ? 0
    : FIRST_MENTION_BONUS;

  const extraMentions = Math.max(occurrences - 1, 0);
  const mentionBonus = Math.min(extraMentions, MENTION_BONUS_CAP);

  const mentionChunks = recentChunks.filter((chunk) =>
    (chunk.text ?? '').toLowerCase().includes(candidate.conceptLabel.toLowerCase())
  );
  const questionBoost = mentionChunks.some((chunk) =>
    chunkHasQuestionCue(chunk, candidate.conceptLabel)
  )
    ? QUESTION_BONUS
    : 0;

  const glossaryBoost = candidate.matchSource === 'glossary' ? GLOSSARY_BONUS : 0;
  const factBoost = candidate.matchSource === 'fact' ? FACT_BONUS : 0;

  const recentCards = runtime.cardsStore.getRecent(recentLimit);
  const normalizedConceptId = candidate.conceptId.toLowerCase();
  let visiblePenaltyValue = 0;
  if (recentCards.length > 0) {
    const [mostRecent, ...rest] = recentCards;
    if (mostRecent.conceptId.toLowerCase() === normalizedConceptId) {
      visiblePenaltyValue = VISIBLE_STRONG_PENALTY;
    } else if (
      rest.some((card) => card.conceptId.toLowerCase() === normalizedConceptId)
    ) {
      visiblePenaltyValue = VISIBLE_PENALTY;
    }
  }

  const suppressionPenalty = SUPPRESSION_PENALTY;

  const score =
    baseWeight +
    firstMention +
    mentionBonus +
    questionBoost +
    glossaryBoost +
    factBoost -
    visiblePenaltyValue -
    suppressionPenalty;

  return {
    score,
    components: {
      baseWeight,
      firstMention,
      mentionBonus,
      questionBoost,
      glossaryBoost,
      factBoost,
      visiblePenalty: -visiblePenaltyValue,
      suppressionPenalty: -suppressionPenalty,
    },
  };
}

function chunkHasQuestionCue(chunk: TranscriptChunk, conceptLabel: string): boolean {
  const text = chunk.text ?? '';
  if (!text) {
    return false;
  }

  const label = conceptLabel.toLowerCase();
  if (!text.toLowerCase().includes(label)) {
    return false;
  }

  const trimmed = text.trim();
  if (trimmed.includes('?')) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  if (QUESTION_TERMS.some((term) => lower.startsWith(`${term} `))) {
    return true;
  }

  return QUESTION_TERMS.some((term) => lower.includes(` ${term} `));
}

