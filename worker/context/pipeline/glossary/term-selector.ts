import type { Blueprint } from '../blueprint/types';
import type { ResearchResults, GlossaryPlanTerm } from './types';

export const selectGlossaryTerms = (blueprint: Blueprint): GlossaryPlanTerm[] =>
  blueprint.glossary_plan.terms ?? [];

export const buildResearchContext = (research: ResearchResults): string =>
  research.chunks
    .map((chunk) => chunk.text)
    .join('\n\n')
    .substring(0, 10000);

