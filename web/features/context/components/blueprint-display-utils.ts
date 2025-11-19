import type {
  BlueprintAgentAlignment,
  BlueprintAgentType,
  BlueprintChunksPlan,
  BlueprintGlossaryPlan,
  BlueprintResearchPlan,
} from '@/shared/hooks/use-blueprint-full-query';

export interface BlueprintAudienceProfile {
  audience_summary: string;
  primary_roles: string[];
  core_needs: string[];
  desired_outcomes: string[];
  tone_and_voice: string;
  cautionary_notes: string[];
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const isResearchPlan = (value: unknown): value is BlueprintResearchPlan =>
  isRecord(value) &&
  Array.isArray(value.queries) &&
  value.queries.every(
    (query) =>
      isRecord(query) &&
      typeof query.query === 'string' &&
      (query.api === 'exa' || query.api === 'wikipedia') &&
      typeof query.priority === 'number' &&
      (query.estimated_cost === undefined || typeof query.estimated_cost === 'number') &&
      (query.purpose === undefined ||
        (Array.isArray(query.purpose) &&
          query.purpose.every(
            (item) => item === 'facts' || item === 'cards' || item === 'glossary'
          ))) &&
      (query.provenance_hint === undefined || typeof query.provenance_hint === 'string')
  ) &&
  typeof value.total_searches === 'number' &&
  typeof value.estimated_total_cost === 'number';

export const isGlossaryPlan = (value: unknown): value is BlueprintGlossaryPlan =>
  isRecord(value) &&
  Array.isArray(value.terms) &&
  value.terms.every(
    (term) =>
      isRecord(term) &&
      typeof term.term === 'string' &&
      typeof term.is_acronym === 'boolean' &&
      typeof term.category === 'string' &&
      typeof term.priority === 'number'
  ) &&
  typeof value.estimated_count === 'number';

export const isAgentUtilityArray = (value: unknown): value is BlueprintAgentType[] =>
  Array.isArray(value) && value.every((agent) => agent === 'facts' || agent === 'cards');

type LegacyChunkSource = {
  source: string;
  priority: number;
  estimated_chunks: number;
  serves_agents?: BlueprintAgentType[];
  upstream_reference?: string;
  expected_format?: string;
};

export const isChunkSourceV2 = (value: unknown): value is BlueprintChunksPlan['sources'][number] =>
  isRecord(value) &&
  typeof value.label === 'string' &&
  typeof value.upstream_reference === 'string' &&
  typeof value.expected_format === 'string' &&
  typeof value.priority === 'number' &&
  typeof value.estimated_chunks === 'number' &&
  isAgentUtilityArray(value.agent_utility);

const isChunkSourceLegacy = (value: unknown): value is LegacyChunkSource =>
  isRecord(value) &&
  typeof value.source === 'string' &&
  typeof value.priority === 'number' &&
  typeof value.estimated_chunks === 'number' &&
  (value.serves_agents === undefined || isAgentUtilityArray(value.serves_agents)) &&
  (value.upstream_reference === undefined || typeof value.upstream_reference === 'string') &&
  (value.expected_format === undefined || typeof value.expected_format === 'string');

export const normalizeChunkSource = (
  source: unknown
): BlueprintChunksPlan['sources'][number] | null => {
  if (isChunkSourceV2(source)) {
    return source;
  }

  if (isChunkSourceLegacy(source)) {
    return {
      label: source.source,
      upstream_reference:
        typeof source.upstream_reference === 'string' && source.upstream_reference.trim().length > 0
          ? source.upstream_reference
          : source.source,
      expected_format:
        typeof source.expected_format === 'string' && source.expected_format.trim().length > 0
          ? source.expected_format
          : 'unspecified',
      priority: source.priority,
      estimated_chunks: source.estimated_chunks,
      agent_utility: source.serves_agents ?? [],
    };
  }

  return null;
};

export const parseChunksPlan = (value: unknown): BlueprintChunksPlan | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (!Array.isArray(value.sources)) {
    return undefined;
  }

  const normalizedSources = value.sources
    .map(normalizeChunkSource)
    .filter((source): source is BlueprintChunksPlan['sources'][number] => source !== null);

  if (normalizedSources.length === 0) {
    return undefined;
  }

  const targetCount = typeof value.target_count === 'number' ? value.target_count : undefined;
  const qualityTier =
    value.quality_tier === 'basic' || value.quality_tier === 'comprehensive'
      ? value.quality_tier
      : undefined;
  const rankingStrategy =
    typeof value.ranking_strategy === 'string' && value.ranking_strategy.trim().length > 0
      ? value.ranking_strategy
      : undefined;

  if (targetCount === undefined || !qualityTier || !rankingStrategy) {
    return undefined;
  }

  return {
    sources: normalizedSources,
    target_count: targetCount,
    quality_tier: qualityTier,
    ranking_strategy: rankingStrategy,
  };
};

export const isAgentAlignment = (value: unknown): value is BlueprintAgentAlignment =>
  isRecord(value) &&
  (!value.facts ||
    (isRecord(value.facts) &&
      (value.facts.highlights === undefined || isStringArray(value.facts.highlights)) &&
      (value.facts.open_questions === undefined ||
        isStringArray(value.facts.open_questions)))) &&
  (!value.cards ||
    (isRecord(value.cards) &&
      (value.cards.assets === undefined || isStringArray(value.cards.assets)) &&
      (value.cards.open_questions === undefined ||
        isStringArray(value.cards.open_questions))));

export const asResearchPlan = (
  primary: unknown,
  fallback: unknown
): BlueprintResearchPlan | undefined => {
  if (isResearchPlan(primary)) {
    return primary;
  }
  if (isResearchPlan(fallback)) {
    return fallback;
  }
  return undefined;
};

export const asGlossaryPlan = (
  primary: unknown,
  fallback: unknown
): BlueprintGlossaryPlan | undefined => {
  if (isGlossaryPlan(primary)) {
    return primary;
  }
  if (isGlossaryPlan(fallback)) {
    return fallback;
  }
  return undefined;
};

export const asChunksPlan = (
  primary: unknown,
  fallback: unknown
): BlueprintChunksPlan | undefined =>
  parseChunksPlan(primary) ?? parseChunksPlan(fallback);

export const asAgentAlignment = (
  primary: unknown,
  fallback: unknown
): BlueprintAgentAlignment | undefined => {
  if (isAgentAlignment(primary)) {
    return primary;
  }
  if (isAgentAlignment(fallback)) {
    return fallback;
  }
  return undefined;
};

export const formatCurrency = (value: number | undefined) =>
  typeof value === 'number' ? `$${value.toFixed(4)}` : '—';

export const formatPurpose = (purpose: string[] | undefined) =>
  Array.isArray(purpose) && purpose.length > 0 ? purpose.join(', ') : '—';

export const isAudienceProfile = (value: unknown): value is BlueprintAudienceProfile =>
  isRecord(value) &&
  typeof value.audience_summary === 'string' &&
  isStringArray(value.primary_roles ?? []) &&
  isStringArray(value.core_needs ?? []) &&
  isStringArray(value.desired_outcomes ?? []) &&
  typeof value.tone_and_voice === 'string' &&
  isStringArray(value.cautionary_notes ?? []);

export const asAudienceProfile = (
  primary: unknown,
  fallback?: unknown
): BlueprintAudienceProfile | undefined => {
  if (isAudienceProfile(primary)) {
    return primary;
  }
  if (isAudienceProfile(fallback)) {
    return fallback;
  }
  return undefined;
};

