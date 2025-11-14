import type { Blueprint } from './types';

const isMeaningfulString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const postProcessBlueprint = (input: Blueprint, topic: string): Blueprint => {
  const blueprint: Blueprint = {
    ...input,
    important_details: [...input.important_details],
    inferred_topics: [...input.inferred_topics],
    key_terms: [...input.key_terms],
    audience_profile: {
      audience_summary:
        typeof input.audience_profile?.audience_summary === 'string'
          ? input.audience_profile.audience_summary.trim()
          : '',
      primary_roles: [...(input.audience_profile?.primary_roles ?? [])],
      core_needs: [...(input.audience_profile?.core_needs ?? [])],
      desired_outcomes: [...(input.audience_profile?.desired_outcomes ?? [])],
      tone_and_voice:
        typeof input.audience_profile?.tone_and_voice === 'string'
          ? input.audience_profile.tone_and_voice.trim()
          : '',
      cautionary_notes: [...(input.audience_profile?.cautionary_notes ?? [])],
    },
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
    agent_alignment: {
      facts: {
        highlights: [...input.agent_alignment.facts.highlights],
        open_questions: [...input.agent_alignment.facts.open_questions],
      },
      cards: {
        assets: [...input.agent_alignment.cards.assets],
        open_questions: [...input.agent_alignment.cards.open_questions],
      },
    },
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

  blueprint.audience_profile.audience_summary =
    blueprint.audience_profile.audience_summary && blueprint.audience_profile.audience_summary.length > 0
      ? blueprint.audience_profile.audience_summary
      : `Mixed team of executives and practitioners tracking ${topic}; prioritize succinct, actionable context grounded in current developments.`;

  const normalizeAudienceArray = (values: string[], fallback: string[]): string[] => {
    const normalized = values.map((value) => value.trim()).filter(isMeaningfulString);
    return normalized.length > 0 ? normalized : fallback;
  };

  blueprint.audience_profile.primary_roles = normalizeAudienceArray(
    blueprint.audience_profile.primary_roles,
    ['Executives', 'Practitioners']
  );

  blueprint.audience_profile.core_needs = normalizeAudienceArray(
    blueprint.audience_profile.core_needs,
    ['Understand implications quickly', 'Identify next best actions']
  );

  blueprint.audience_profile.desired_outcomes = normalizeAudienceArray(
    blueprint.audience_profile.desired_outcomes,
    ['Leave with clear actions', 'Spot key opportunities or risks']
  );

  blueprint.audience_profile.cautionary_notes = normalizeAudienceArray(
    blueprint.audience_profile.cautionary_notes,
    ['Avoid speculation; focus on verified facts']
  );

  blueprint.audience_profile.tone_and_voice =
    blueprint.audience_profile.tone_and_voice && blueprint.audience_profile.tone_and_voice.length > 0
      ? blueprint.audience_profile.tone_and_voice
      : 'Confident, concise, and audience-first.';

  if (blueprint.research_plan.queries.length === 0) {
    blueprint.research_plan.queries = [
      {
        query: `latest developments and trends in ${topic} 2024`,
        api: 'exa',
        priority: 1,
        estimated_cost: 0.03,
        agent_utility: ['facts', 'cards'],
        provenance_hint: `General coverage on ${topic}`,
      },
    ];
    blueprint.research_plan.total_searches = 1;
    blueprint.research_plan.estimated_total_cost = 0.03;
    console.error(
      `[blueprint] CRITICAL: Research plan queries empty after all retries, using minimal fallback`
    );
  }

  if (blueprint.glossary_plan.terms.length === 0) {
    const fallbackUtility: Array<'facts' | 'cards'> = ['facts', 'cards'];
    blueprint.glossary_plan.terms = [
      {
        term: topic,
        is_acronym: false,
        category: 'domain-specific',
        priority: 1,
        agent_utility: fallbackUtility,
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
        label: 'LLM Generated Summary',
        upstream_reference: 'fallback',
        expected_format: 'llm_summary',
        priority: 1,
        estimated_chunks:
          blueprint.chunks_plan.target_count && blueprint.chunks_plan.target_count > 0
            ? blueprint.chunks_plan.target_count
            : 100,
        agent_utility: ['cards', 'facts'],
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
    typeof blueprint.chunks_plan.target_count !== 'number' ||
    !Number.isFinite(blueprint.chunks_plan.target_count) ||
    blueprint.chunks_plan.target_count <= 0
  ) {
    blueprint.chunks_plan.target_count = 100;
  }

  if (blueprint.research_plan.queries) {
    const normalizedQueries = blueprint.research_plan.queries.map(
      (queryPlan): Blueprint['research_plan']['queries'][number] => ({
      query: queryPlan.query || '',
      api: queryPlan.api === 'exa' || queryPlan.api === 'wikipedia' ? queryPlan.api : 'exa',
      priority: queryPlan.priority || 5,
      estimated_cost: queryPlan.estimated_cost || (queryPlan.api === 'exa' ? 0.03 : 0.001),
      agent_utility:
        Array.isArray(queryPlan.agent_utility) && queryPlan.agent_utility.length > 0
          ? queryPlan.agent_utility.filter(
              (consumer): consumer is 'facts' | 'cards' | 'glossary' =>
                consumer === 'facts' || consumer === 'cards' || consumer === 'glossary'
            )
          : ['facts'],
      provenance_hint:
        typeof queryPlan.provenance_hint === 'string' && queryPlan.provenance_hint.length > 0
          ? queryPlan.provenance_hint
          : 'Provenance not specified',
      })
    );

    const cappedQueries: Blueprint['research_plan']['queries'] = [];
    let exaPriorityOneCount = 0;
    let exaPriorityTwoCount = 0;

    for (const query of normalizedQueries) {
      if (query.api === 'exa' && query.priority === 1) {
        if (exaPriorityOneCount < 1) {
          exaPriorityOneCount += 1;
          cappedQueries.push(query);
        } else {
          console.warn(
            `[blueprint] Downgrading excess priority 1 Exa /research query "${query.query}" to control spend`
          );
          cappedQueries.push({
            ...query,
            api: 'wikipedia',
            priority: Math.max(2, query.priority + 1),
            estimated_cost: 0.001,
          });
        }
        continue;
      }

      if (query.api === 'exa' && query.priority === 2) {
        if (exaPriorityTwoCount < 4) {
          exaPriorityTwoCount += 1;
          cappedQueries.push(query);
        } else {
          console.warn(
            `[blueprint] Downgrading excess priority 2 Exa /search query "${query.query}" to control spend`
          );
          cappedQueries.push({
            ...query,
            api: 'wikipedia',
            priority: Math.max(3, query.priority + 1),
            estimated_cost: 0.001,
          });
        }
        continue;
      }

      cappedQueries.push(query);
    }

    blueprint.research_plan.queries = cappedQueries;
    blueprint.research_plan.total_searches = cappedQueries.length;
    blueprint.research_plan.estimated_total_cost = cappedQueries.reduce(
      (sum, queryPlan) => sum + (queryPlan.estimated_cost || 0),
      0
    );
  }

  if (blueprint.glossary_plan.terms) {
    const normalizedTerms = blueprint.glossary_plan.terms.map(
      (termPlan): Blueprint['glossary_plan']['terms'][number] => ({
      term: termPlan.term || '',
      is_acronym: termPlan.is_acronym || false,
      category: termPlan.category || 'general',
      priority: termPlan.priority || 5,
      agent_utility:
        Array.isArray(termPlan.agent_utility) && termPlan.agent_utility.length > 0
          ? termPlan.agent_utility.filter(
              (agent): agent is 'facts' | 'cards' => agent === 'facts' || agent === 'cards'
            )
          : ['facts', 'cards'],
      })
    );

    let priorityOneCount = 0;
    const cappedTerms: Blueprint['glossary_plan']['terms'] = normalizedTerms.map((termPlan) => {
      if (termPlan.priority === 1) {
        if (priorityOneCount < 3) {
          priorityOneCount += 1;
          return termPlan;
        }

        console.warn(
          `[blueprint] Downgrading glossary term "${termPlan.term}" from priority 1 to cap Exa usage`
        );
        return {
          ...termPlan,
          priority: Math.max(2, termPlan.priority + 1),
        };
      }

      return termPlan;
    });

    blueprint.glossary_plan.terms = cappedTerms;
    blueprint.glossary_plan.estimated_count = cappedTerms.length;
  }

  if (blueprint.chunks_plan.sources) {
    blueprint.chunks_plan.sources = blueprint.chunks_plan.sources.map((sourcePlan) => ({
      label: sourcePlan.label || '',
      upstream_reference: sourcePlan.upstream_reference || 'unspecified',
      expected_format: sourcePlan.expected_format || 'unspecified',
      priority: sourcePlan.priority || 5,
      estimated_chunks: sourcePlan.estimated_chunks || 10,
      agent_utility:
        Array.isArray(sourcePlan.agent_utility) && sourcePlan.agent_utility.length > 0
          ? sourcePlan.agent_utility.filter(
              (agent): agent is 'facts' | 'cards' => agent === 'facts' || agent === 'cards'
            )
          : ['cards'],
    }));
  }

  blueprint.agent_alignment.facts.highlights = blueprint.agent_alignment.facts.highlights.filter(
    isMeaningfulString
  );
  blueprint.agent_alignment.facts.open_questions =
    blueprint.agent_alignment.facts.open_questions.filter(isMeaningfulString);
  blueprint.agent_alignment.cards.assets = blueprint.agent_alignment.cards.assets.filter(
    isMeaningfulString
  );
  blueprint.agent_alignment.cards.open_questions =
    blueprint.agent_alignment.cards.open_questions.filter(isMeaningfulString);

  if (blueprint.cost_breakdown.total === 0) {
    blueprint.cost_breakdown.total =
      blueprint.cost_breakdown.research +
      blueprint.cost_breakdown.glossary +
      blueprint.cost_breakdown.chunks;
  }

  return blueprint;
};

