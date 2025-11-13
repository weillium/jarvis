import type { GlossaryPlanTerm, ResearchResults } from './types';

interface ScoredSnippet {
  text: string;
  score: number;
}

const SNIPPET_LIMIT = 3;
const MAX_SNIPPET_LENGTH = 500;

const normalize = (value: string): string => value.toLowerCase();

const scoreSnippet = (termWords: string[], text: string): number => {
  const normalized = normalize(text);
  let score = 0;

  for (const word of termWords) {
    if (!word) {
      continue;
    }
    if (normalized.includes(word)) {
      score += 2;
    }
  }

  // Light boost for acronym-style matches (e.g., "API" in uppercase)
  const uppercaseMatches = termWords.filter(
    (word) => word.length > 2 && text.includes(word.toUpperCase())
  );
  score += uppercaseMatches.length;

  return score;
};

export const selectRelevantSnippets = (
  term: GlossaryPlanTerm,
  research: ResearchResults,
  limit: number = SNIPPET_LIMIT
): string[] => {
  if (!research.chunks.length) {
    return [];
  }

  const termWords = term.term
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const termAgentTargets = new Set(term.agent_utility ?? []);

  const scored: ScoredSnippet[] = research.chunks.map((chunk) => {
    const baseScore = scoreSnippet(termWords, chunk.text);
    const qualityBoost =
      typeof chunk.metadata?.quality_score === 'number'
        ? Math.max(0, Math.min(chunk.metadata.quality_score, 1))
        : 0;

    const metadataAgentsRaw = chunk.metadata?.agent_utility;
    const metadataAgents = Array.isArray(metadataAgentsRaw)
      ? metadataAgentsRaw.filter(
          (agent): agent is 'facts' | 'cards' | 'glossary' =>
            agent === 'facts' || agent === 'cards' || agent === 'glossary'
        )
      : [];

    const supportedAgents = metadataAgents.filter(
      (agent): agent is 'facts' | 'cards' => agent === 'facts' || agent === 'cards'
    );

    const agentMatchBoost =
      supportedAgents.length > 0 && termAgentTargets.size > 0
        ? supportedAgents.some((agent) => termAgentTargets.has(agent))
          ? 1.5
          : 0
        : 0;

    const queryPriority =
      typeof chunk.metadata?.query_priority === 'number'
        ? chunk.metadata.query_priority
        : typeof chunk.metadata?.priority === 'number'
          ? chunk.metadata.priority
          : null;

    const priorityBoost =
      queryPriority !== null ? Math.max(0, (5 - Math.min(queryPriority, 5)) * 0.25) : 0;

    return {
      text: chunk.text,
      score: baseScore + qualityBoost + agentMatchBoost + priorityBoost,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const topSnippets = scored
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.text);

  if (topSnippets.length > 0) {
    return topSnippets.map((snippet) =>
      snippet.length > MAX_SNIPPET_LENGTH
        ? `${snippet.slice(0, MAX_SNIPPET_LENGTH)}…`
        : snippet
    );
  }

  // Fallback: take the first few chunks even if no strong matches
  return research.chunks
    .slice(0, limit)
    .map((chunk) =>
      chunk.text.length > MAX_SNIPPET_LENGTH
        ? `${chunk.text.slice(0, MAX_SNIPPET_LENGTH)}…`
        : chunk.text
    );
};

