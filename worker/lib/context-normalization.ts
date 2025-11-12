import type { Blueprint } from '../context/pipeline/blueprint/types';
import type {
  ContextBlueprintRecord,
  GenerationCycleMetadataRecord,
} from '../types';

export interface GlossaryTermDefinition {
  term: string;
  definition: string;
  acronym_for?: string;
  category: string;
  usage_examples?: string[];
  related_terms?: string[];
  confidence_score?: number;
  source?: string;
  source_url?: string;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const expectRecord = (
  value: unknown,
  context: string
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${context} returned unexpected shape`);
  }
  return value;
};

export const extractId = (row: unknown, context: string): string => {
  const record = expectRecord(row, context);
  const id = record.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${context} missing id`);
  }
  return id;
};

export const extractIdList = (rows: unknown, context: string): string[] => {
  if (!Array.isArray(rows)) {
    throw new Error(`${context} response missing rows`);
  }
  return rows.map((row, index) => extractId(row, `${context} [${index}]`));
};

export const mapGenerationCycleMetadata = (
  row: unknown
): GenerationCycleMetadataRecord => {
  const record = expectRecord(row, 'generation cycle metadata');
  const metadata = record.metadata;
  if (metadata === null || metadata === undefined) {
    return { metadata: null };
  }
  if (!isRecord(metadata)) {
    console.warn('[context-gen] Generation cycle metadata is not an object, ignoring');
    return { metadata: {} };
  }
  return { metadata };
};

export const mapContextBlueprintRow = (
  row: unknown
): ContextBlueprintRecord => {
  const record = expectRecord(row, 'context blueprint');
  const { id, status, blueprint } = record;
  if (typeof id !== 'string' || typeof status !== 'string' || blueprint === undefined) {
    throw new Error('Context blueprint row missing required fields');
  }
  return {
    id,
    status,
    blueprint,
    error_message:
      typeof record.error_message === 'string'
        ? record.error_message
        : record.error_message === null
          ? null
          : undefined,
  };
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isAgentUtilityArray = (
  value: unknown
): value is Array<'facts' | 'cards' | 'glossary'> =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) => item === 'facts' || item === 'cards' || item === 'glossary'
  );

const isResearchQuery = (value: unknown): value is {
  query: string;
  api: 'exa' | 'wikipedia';
  priority: number;
  estimated_cost?: number;
  agent_utility: Array<'facts' | 'cards' | 'glossary'>;
  provenance_hint: string;
} =>
  isRecord(value) &&
  typeof value.query === 'string' &&
  (value.api === 'exa' || value.api === 'wikipedia') &&
  typeof value.priority === 'number' &&
  isAgentUtilityArray(value.agent_utility) &&
  (value.estimated_cost === undefined || typeof value.estimated_cost === 'number') &&
  typeof value.provenance_hint === 'string';

const isResearchPlan = (value: unknown): value is Blueprint['research_plan'] =>
  isRecord(value) &&
  Array.isArray(value.queries) &&
  value.queries.every(isResearchQuery) &&
  typeof value.total_searches === 'number' &&
  typeof value.estimated_total_cost === 'number';

const isGlossaryTermPlan = (value: unknown): value is {
  term: string;
  is_acronym: boolean;
  category: string;
  priority: number;
  agent_utility: Array<'facts' | 'cards'>;
} =>
  isRecord(value) &&
  typeof value.term === 'string' &&
  typeof value.is_acronym === 'boolean' &&
  typeof value.category === 'string' &&
  typeof value.priority === 'number' &&
  Array.isArray(value.agent_utility) &&
  value.agent_utility.length > 0 &&
  value.agent_utility.every((agent) => agent === 'facts' || agent === 'cards');

const isGlossaryPlan = (value: unknown): value is Blueprint['glossary_plan'] =>
  isRecord(value) &&
  Array.isArray(value.terms) &&
  value.terms.every(isGlossaryTermPlan) &&
  typeof value.estimated_count === 'number';

const isChunkSourcePlan = (value: unknown): value is {
  label: string;
  upstream_reference: string;
  expected_format: string;
  priority: number;
  estimated_chunks: number;
  agent_utility: Array<'facts' | 'cards'>;
} =>
  isRecord(value) &&
  typeof value.label === 'string' &&
  typeof value.upstream_reference === 'string' &&
  typeof value.expected_format === 'string' &&
  typeof value.priority === 'number' &&
  typeof value.estimated_chunks === 'number' &&
  Array.isArray(value.agent_utility) &&
  value.agent_utility.length > 0 &&
  value.agent_utility.every((agent) => agent === 'facts' || agent === 'cards');

const isChunksPlan = (value: unknown): value is Blueprint['chunks_plan'] =>
  isRecord(value) &&
  Array.isArray(value.sources) &&
  value.sources.every(isChunkSourcePlan) &&
  typeof value.target_count === 'number' &&
  (value.quality_tier === 'basic' || value.quality_tier === 'comprehensive') &&
  typeof value.ranking_strategy === 'string';

const isCostBreakdown = (
  value: unknown
): value is Blueprint['cost_breakdown'] =>
  isRecord(value) &&
  typeof value.research === 'number' &&
  typeof value.glossary === 'number' &&
  typeof value.chunks === 'number' &&
  typeof value.total === 'number';

const isAgentAlignment = (
  value: unknown
): value is Blueprint['agent_alignment'] =>
  isRecord(value) &&
  isRecord(value.facts) &&
  isStringArray(value.facts.highlights) &&
  isStringArray(value.facts.open_questions) &&
  isRecord(value.cards) &&
  isStringArray(value.cards.assets) &&
  isStringArray(value.cards.open_questions);

const isBlueprint = (value: unknown): value is Blueprint =>
  isRecord(value) &&
  isStringArray(value.important_details) &&
  isStringArray(value.inferred_topics) &&
  isStringArray(value.key_terms) &&
  isResearchPlan(value.research_plan) &&
  isGlossaryPlan(value.glossary_plan) &&
  isChunksPlan(value.chunks_plan) &&
  isCostBreakdown(value.cost_breakdown) &&
  isAgentAlignment(value.agent_alignment);

export const ensureBlueprintShape = (value: unknown): Blueprint => {
  const issues: string[] = [];

  if (isBlueprint(value)) {
    return value;
  }

  if (!isRecord(value)) {
    issues.push('payload is not an object');
  } else {
    if (!isStringArray(value.important_details)) {
      issues.push('important_details must be an array of strings with at least 5 items');
    }
    if (!isStringArray(value.inferred_topics)) {
      issues.push('inferred_topics must be an array of strings with at least 5 items');
    }
    if (!isStringArray(value.key_terms)) {
      issues.push('key_terms must be an array of strings with at least 10 items');
    }
    if (!isResearchPlan(value.research_plan)) {
      issues.push('research_plan is missing required fields or contains invalid queries');
    }
    if (!isGlossaryPlan(value.glossary_plan)) {
      issues.push('glossary_plan is missing required fields or term entries are invalid');
    }
    if (!isChunksPlan(value.chunks_plan)) {
      issues.push('chunks_plan is missing required fields or contains invalid sources');
    }
    if (!isCostBreakdown(value.cost_breakdown)) {
      issues.push('cost_breakdown must include numeric research, glossary, chunks, and total values');
    }
  }

  if (issues.length > 0) {
    console.error('[blueprint] Blueprint validation failed', {
      issues,
    });
    const error = new Error('Blueprint stored in database has unexpected shape');
    (error as { blueprintIssues?: string[] }).blueprintIssues = issues;
    throw error;
  }

  return value as Blueprint;
};

export const normalizeGlossaryDefinitions = (
  llmDefinitions: unknown[]
): GlossaryTermDefinition[] => {
  return llmDefinitions.map((def) => {
    const normalized = (def as Partial<GlossaryTermDefinition>) ?? {};
    return {
      term: normalized.term || '',
      definition: normalized.definition || '',
      acronym_for: normalized.acronym_for || undefined,
      category: normalized.category || 'general',
      usage_examples: normalized.usage_examples || [],
      related_terms: normalized.related_terms || [],
      confidence_score: normalized.confidence_score ?? 0.8,
      source: normalized.source || 'llm_generation',
      source_url: normalized.source_url || undefined,
    };
  });
};
