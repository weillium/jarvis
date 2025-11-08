import type { Blueprint } from './types';

const isMeaningfulString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const postProcessBlueprint = (input: Blueprint, topic: string): Blueprint => {
  const blueprint: Blueprint = {
    ...input,
    important_details: [...input.important_details],
    inferred_topics: [...input.inferred_topics],
    key_terms: [...input.key_terms],
    research_plan: {
      ...input.research_plan,
      queries: [...input.research_plan.queries],
    },
    glossary_plan: {
      ...input.glossary_plan,
      terms: [...input.glossary_plan.terms],
    },
    chunks_plan: {
      ...input.chunks_plan,
      sources: [...input.chunks_plan.sources],
    },
    cost_breakdown: { ...input.cost_breakdown },
  };

  if (blueprint.important_details.length >= 5) {
    blueprint.important_details = blueprint.important_details.filter(isMeaningfulString);
  } else if (blueprint.important_details.length === 0) {
    console.error(
      `[blueprint] CRITICAL: Important details empty after all retries, using minimal fallback`
    );
    blueprint.important_details = [
      `Event focuses on ${topic} - content generation failed, please regenerate blueprint`,
    ];
  }

  if (blueprint.inferred_topics.length >= 5) {
    blueprint.inferred_topics = blueprint.inferred_topics.filter(isMeaningfulString);
  } else if (blueprint.inferred_topics.length === 0) {
    console.error(
      `[blueprint] CRITICAL: Inferred topics empty after all retries, using minimal fallback`
    );
    blueprint.inferred_topics = [`${topic} Fundamentals`, `${topic} Best Practices`];
  }

  if (blueprint.key_terms.length >= 10) {
    blueprint.key_terms = blueprint.key_terms.filter(isMeaningfulString);
  } else if (blueprint.key_terms.length === 0) {
    console.error(
      `[blueprint] CRITICAL: Key terms empty after all retries, using minimal fallback`
    );
    blueprint.key_terms = [topic];
  }

  if (blueprint.research_plan.queries.length === 0) {
    blueprint.research_plan.queries = [
      {
        query: `latest developments and trends in ${topic} 2024`,
        api: 'exa',
        priority: 1,
        estimated_cost: 0.03,
      },
    ];
    blueprint.research_plan.total_searches = 1;
    blueprint.research_plan.estimated_total_cost = 0.03;
    console.error(
      `[blueprint] CRITICAL: Research plan queries empty after all retries, using minimal fallback`
    );
  }

  if (blueprint.glossary_plan.terms.length === 0) {
    blueprint.glossary_plan.terms = [
      {
        term: topic,
        is_acronym: false,
        category: 'domain-specific',
        priority: 1,
      },
    ];
    blueprint.glossary_plan.estimated_count = 1;
    console.error(
      `[blueprint] CRITICAL: Glossary plan terms empty after all retries, using minimal fallback`
    );
  }

  if (blueprint.chunks_plan.sources.length === 0) {
    blueprint.chunks_plan.sources = [
      {
        source: 'llm_generated',
        priority: 1,
        estimated_chunks: blueprint.chunks_plan.target_count || 500,
      },
    ];
    console.error(
      `[blueprint] CRITICAL: Chunks plan sources empty after all retries, using minimal fallback`
    );
  }

  if (
    blueprint.chunks_plan.quality_tier !== 'basic' &&
    blueprint.chunks_plan.quality_tier !== 'comprehensive'
  ) {
    blueprint.chunks_plan.quality_tier =
      blueprint.chunks_plan.target_count >= 1000 ? 'comprehensive' : 'basic';
  }

  if (
    blueprint.chunks_plan.quality_tier === 'comprehensive' &&
    blueprint.chunks_plan.target_count < 1000
  ) {
    blueprint.chunks_plan.target_count = 1000;
  } else if (
    blueprint.chunks_plan.quality_tier === 'basic' &&
    blueprint.chunks_plan.target_count > 500
  ) {
    blueprint.chunks_plan.target_count = 500;
  }

  if (blueprint.research_plan.queries) {
    blueprint.research_plan.queries = blueprint.research_plan.queries.map((queryPlan) => ({
      query: queryPlan.query || '',
      api: queryPlan.api === 'exa' || queryPlan.api === 'wikipedia' ? queryPlan.api : 'exa',
      priority: queryPlan.priority || 5,
      estimated_cost: queryPlan.estimated_cost || (queryPlan.api === 'exa' ? 0.03 : 0.001),
    }));
    blueprint.research_plan.total_searches = blueprint.research_plan.queries.length;
    blueprint.research_plan.estimated_total_cost = blueprint.research_plan.queries.reduce(
      (sum, queryPlan) => sum + (queryPlan.estimated_cost || 0),
      0
    );
  }

  if (blueprint.glossary_plan.terms) {
    blueprint.glossary_plan.terms = blueprint.glossary_plan.terms.map((termPlan) => ({
      term: termPlan.term || '',
      is_acronym: termPlan.is_acronym || false,
      category: termPlan.category || 'general',
      priority: termPlan.priority || 5,
    }));
    blueprint.glossary_plan.estimated_count = blueprint.glossary_plan.terms.length;
  }

  if (blueprint.cost_breakdown.total === 0) {
    blueprint.cost_breakdown.total =
      blueprint.cost_breakdown.research +
      blueprint.cost_breakdown.glossary +
      blueprint.cost_breakdown.chunks;
  }

  return blueprint;
};

