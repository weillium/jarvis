import type { Blueprint } from '../context/pipeline/blueprint-generator';
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

const isResearchQuery = (value: unknown): value is {
  query: string;
  api: 'exa' | 'wikipedia';
  priority: number;
  estimated_cost?: number;
} =>
  isRecord(value) &&
  typeof value.query === 'string' &&
  (value.api === 'exa' || value.api === 'wikipedia') &&
  typeof value.priority === 'number' &&
  (value.estimated_cost === undefined || typeof value.estimated_cost === 'number');

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
} =>
  isRecord(value) &&
  typeof value.term === 'string' &&
  typeof value.is_acronym === 'boolean' &&
  typeof value.category === 'string' &&
  typeof value.priority === 'number';

const isGlossaryPlan = (value: unknown): value is Blueprint['glossary_plan'] =>
  isRecord(value) &&
  Array.isArray(value.terms) &&
  value.terms.every(isGlossaryTermPlan) &&
  typeof value.estimated_count === 'number';

const isChunkSourcePlan = (value: unknown): value is {
  source: string;
  priority: number;
  estimated_chunks: number;
} =>
  isRecord(value) &&
  typeof value.source === 'string' &&
  typeof value.priority === 'number' &&
  typeof value.estimated_chunks === 'number';

const isChunksPlan = (value: unknown): value is Blueprint['chunks_plan'] =>
  isRecord(value) &&
  Array.isArray(value.sources) &&
  value.sources.every(isChunkSourcePlan) &&
  typeof value.target_count === 'number' &&
  (value.quality_tier === 'basic' || value.quality_tier === 'comprehensive') &&
  typeof value.ranking_strategy === 'string';

const isCostBreakdown = (value: unknown): value is Blueprint['cost_breakdown'] =>
  isRecord(value) &&
  typeof value.research === 'number' &&
  typeof value.glossary === 'number' &&
  typeof value.chunks === 'number' &&
  typeof value.total === 'number';

const isBlueprint = (value: unknown): value is Blueprint =>
  isRecord(value) &&
  isStringArray(value.important_details) &&
  isStringArray(value.inferred_topics) &&
  isStringArray(value.key_terms) &&
  isResearchPlan(value.research_plan) &&
  isGlossaryPlan(value.glossary_plan) &&
  isChunksPlan(value.chunks_plan) &&
  isCostBreakdown(value.cost_breakdown);

export const ensureBlueprintShape = (value: unknown): Blueprint => {
  if (!isBlueprint(value)) {
    throw new Error('Blueprint stored in database has unexpected shape');
  }
  return value;
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
