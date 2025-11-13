'use client';

import { useState } from 'react';
import {
  useBlueprintFullQuery,
  type BlueprintAgentAlignment,
  type BlueprintAgentType,
  type BlueprintChunksPlan,
  type BlueprintGlossaryPlan,
  type BlueprintResearchPlan,
} from '@/shared/hooks/use-blueprint-full-query';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isResearchPlan = (value: unknown): value is BlueprintResearchPlan =>
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

const isGlossaryPlan = (value: unknown): value is BlueprintGlossaryPlan =>
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

const isAgentUtilityArray = (value: unknown): value is BlueprintAgentType[] =>
  Array.isArray(value) && value.every((agent) => agent === 'facts' || agent === 'cards');

type LegacyChunkSource = {
  source: string;
  priority: number;
  estimated_chunks: number;
  serves_agents?: BlueprintAgentType[];
  upstream_reference?: string;
  expected_format?: string;
};

const isChunkSourceV2 = (value: unknown): value is BlueprintChunksPlan['sources'][number] =>
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

const normalizeChunkSource = (
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

const parseChunksPlan = (value: unknown): BlueprintChunksPlan | undefined => {
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

const isAgentAlignment = (value: unknown): value is BlueprintAgentAlignment =>
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

const asResearchPlan = (
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

const asGlossaryPlan = (
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

const asChunksPlan = (
  primary: unknown,
  fallback: unknown
): BlueprintChunksPlan | undefined =>
  parseChunksPlan(primary) ?? parseChunksPlan(fallback);

const asAgentAlignment = (
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

const formatCurrency = (value: number | undefined) =>
  typeof value === 'number' ? `$${value.toFixed(4)}` : '—';

const formatPurpose = (purpose: string[] | undefined) =>
  Array.isArray(purpose) && purpose.length > 0 ? purpose.join(', ') : '—';

interface BlueprintDisplayProps {
  eventId: string;
  onRegenerate?: () => void;
  embedded?: boolean; // If true, removes expand button and regenerate button
}

export function BlueprintDisplay({
  eventId,
  onRegenerate,
  embedded = false,
}: BlueprintDisplayProps) {
  const { data: blueprint, isLoading, error } = useBlueprintFullQuery(eventId);
  const [expanded, setExpanded] = useState(embedded); // Auto-expand when embedded

  // Handle regenerate blueprint - just trigger the parent's callback to show prompt preview modal
  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate();
    }
  };

  if (isLoading) {
    return (
      <div style={{
        padding: '16px',
        textAlign: 'center',
        color: '#64748b',
      }}>
        Loading blueprint...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '16px',
        textAlign: 'center',
        color: '#ef4444',
      }}>
        Error loading blueprint: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  if (!blueprint) {
    return (
      <div style={{
        padding: '16px',
        textAlign: 'center',
        color: '#64748b',
      }}>
        No blueprint available
      </div>
    );
  }

  const blueprintJson = isRecord(blueprint.blueprint) ? blueprint.blueprint : null;

  const importantDetails =
    (isStringArray(blueprint.important_details) && blueprint.important_details.length > 0
      ? blueprint.important_details
      : undefined) ??
    (blueprintJson && isStringArray(blueprintJson['important_details'])
      ? blueprintJson['important_details']
      : undefined);

  const inferredTopics =
    (isStringArray(blueprint.inferred_topics) && blueprint.inferred_topics.length > 0
      ? blueprint.inferred_topics
      : undefined) ??
    (blueprintJson && isStringArray(blueprintJson['inferred_topics'])
      ? blueprintJson['inferred_topics']
      : undefined);

  const keyTerms =
    (isStringArray(blueprint.key_terms) && blueprint.key_terms.length > 0
      ? blueprint.key_terms
      : undefined) ??
    (blueprintJson && isStringArray(blueprintJson['key_terms'])
      ? blueprintJson['key_terms']
      : undefined);

  const researchPlan = asResearchPlan(
    blueprint.research_plan,
    blueprintJson ? blueprintJson['research_plan'] : undefined
  );

  const glossaryPlan = asGlossaryPlan(
    blueprint.glossary_plan,
    blueprintJson ? blueprintJson['glossary_plan'] : undefined
  );

  const chunksPlan = asChunksPlan(
    blueprint.chunks_plan,
    blueprintJson ? blueprintJson['chunks_plan'] : undefined
  );

  const agentAlignment = asAgentAlignment(
    blueprint.agent_alignment,
    blueprintJson ? blueprintJson['agent_alignment'] : undefined
  );

  const costBreakdown = isRecord(blueprint.cost_breakdown)
    ? (blueprint.cost_breakdown as Record<string, unknown>)
    : isRecord(blueprintJson?.['cost_breakdown'])
      ? (blueprintJson?.['cost_breakdown'] as Record<string, unknown>)
      : null;

  const chunkPlanStats = chunksPlan
    ? chunksPlan.sources.reduce(
        (acc, source) => {
          acc.total += source.estimated_chunks;
          if (source.agent_utility.includes('facts')) {
            acc.facts += source.estimated_chunks;
          }
          if (source.agent_utility.includes('cards')) {
            acc.cards += source.estimated_chunks;
          }
          return acc;
        },
        { total: 0, facts: 0, cards: 0 }
      )
    : null;

  const chunkPlanCoverage =
    chunksPlan && chunkPlanStats && chunksPlan.target_count > 0
      ? Math.round((chunkPlanStats.total / chunksPlan.target_count) * 100)
      : null;

  const targetChunkCount = blueprint.target_chunk_count ?? chunksPlan?.target_count ?? null;
  const qualityTier = blueprint.quality_tier ?? chunksPlan?.quality_tier ?? null;

  return (
    <div style={{
      ...(embedded ? {} : {
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '20px',
        background: '#f8fafc',
      }),
    }}>
      {/* Header - only show title when not embedded */}
      {!embedded && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <h4 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#0f172a',
            margin: 0,
          }}>
            Context Blueprint
          </h4>
        </div>
      )}

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '16px',
      }}>
        {targetChunkCount !== null && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
              Target Chunks (Plan)
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
              {targetChunkCount.toLocaleString()}
            </div>
          </div>
        )}
        {chunkPlanStats && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
              Estimated Chunks (Plan)
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
              {chunkPlanStats.total.toLocaleString()}
            </div>
            {chunkPlanCoverage !== null && (
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {chunkPlanCoverage}% of target
              </div>
            )}
          </div>
        )}
        {qualityTier && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
              Quality Tier
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', textTransform: 'capitalize' }}>
              {qualityTier}
            </div>
          </div>
        )}
        {blueprint.estimated_cost !== null && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
              Estimated Cost
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
              ${blueprint.estimated_cost.toFixed(4)}
            </div>
          </div>
        )}
      </div>

      {/* Expandable details */}
      {expanded && (
        <div style={{ marginTop: '20px' }}>
          {/* Important Details */}
          {importantDetails && importantDetails.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Important Details
              </h5>
              <ul style={{
                margin: 0,
                paddingLeft: '20px',
                color: '#475569',
                fontSize: '14px',
              }}>
                {importantDetails.map((detail, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Inferred Topics */}
          {inferredTopics && inferredTopics.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Inferred Topics
              </h5>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {inferredTopics.map((topic, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      background: '#e0e7ff',
                      color: '#4338ca',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key Terms */}
          {keyTerms && keyTerms.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Key Terms
              </h5>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {keyTerms.map((term, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      background: '#fef3c7',
                      color: '#92400e',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Research Plan */}
          {researchPlan && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Research Plan
              </h5>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  background: '#ffffff',
                }}>
                  <thead>
                    <tr>
                      {['Query', 'API', 'Priority', 'Estimated Cost', 'Serves Agents', 'Provenance'].map((header) => (
                        <th
                          key={header}
                          style={{
                            textAlign: 'left',
                            padding: '8px',
                            borderBottom: '1px solid #e2e8f0',
                            color: '#475569',
                            fontWeight: 600,
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {researchPlan.queries.map((query, i) => (
                      <tr key={`${query.query}-${i}`}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
                          {query.query}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', color: '#475569' }}>
                          {query.api}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {query.priority}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {formatCurrency(query.estimated_cost)}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {formatPurpose(
                            Array.isArray(query.agent_utility) ? query.agent_utility : undefined
                          )}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {query.provenance_hint && query.provenance_hint.trim().length > 0
                            ? query.provenance_hint
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
                <strong>Total Searches:</strong> {researchPlan.total_searches} &nbsp;•&nbsp; <strong>Estimated Total Cost:</strong> {formatCurrency(researchPlan.estimated_total_cost)}
              </div>
            </div>
          )}

          {/* Glossary Plan */}
          {glossaryPlan && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Glossary Plan
              </h5>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  background: '#ffffff',
                }}>
                  <thead>
                    <tr>
                      {['Term', 'Acronym', 'Category', 'Priority', 'Serves Agents'].map((header) => (
                        <th
                          key={header}
                          style={{
                            textAlign: 'left',
                            padding: '8px',
                            borderBottom: '1px solid #e2e8f0',
                            color: '#475569',
                            fontWeight: 600,
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {glossaryPlan.terms.map((term, i) => (
                      <tr key={`${term.term}-${i}`}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
                          {term.term}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {term.is_acronym ? 'Yes' : 'No'}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {term.category}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {term.priority}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {formatPurpose(
                            Array.isArray(term.agent_utility) ? term.agent_utility : undefined
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
                <strong>Estimated Count:</strong> {glossaryPlan.estimated_count}
              </div>
            </div>
          )}

          {/* Chunks Plan */}
          {chunksPlan && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Chunks Plan
              </h5>
              {chunkPlanStats && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  fontSize: '12px',
                  color: '#475569',
                  marginBottom: '12px',
                }}>
                  <div>
                    <strong>{chunksPlan.sources.length}</strong> planned sources
                  </div>
                  <div>
                    <strong>{chunkPlanStats.total.toLocaleString()}</strong> estimated chunks
                  </div>
                  <div>
                    <strong>{chunkPlanStats.facts.toLocaleString()}</strong> for facts
                  </div>
                  <div>
                    <strong>{chunkPlanStats.cards.toLocaleString()}</strong> for cards
                  </div>
                  {chunkPlanCoverage !== null && (
                    <div>
                      <strong>{chunkPlanCoverage}%</strong> of target coverage
                    </div>
                  )}
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  background: '#ffffff',
                }}>
                  <thead>
                    <tr>
                      {['Label', 'Upstream Reference', 'Expected Format', 'Priority', 'Estimated Chunks', 'Agent Utility'].map((header) => (
                        <th
                          key={header}
                          style={{
                            textAlign: 'left',
                            padding: '8px',
                            borderBottom: '1px solid #e2e8f0',
                            color: '#475569',
                            fontWeight: 600,
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chunksPlan.sources.map((source, i) => (
                      <tr key={`${source.label}-${source.upstream_reference}-${i}`}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#0f172a', fontWeight: 500 }}>
                          {source.label}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={source.upstream_reference}>
                          {source.upstream_reference}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569', textTransform: 'capitalize' }}>
                          {source.expected_format}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {source.priority}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {source.estimated_chunks}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                          {formatPurpose(source.agent_utility)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
                <strong>Target Count (Plan):</strong> {chunksPlan.target_count}
                &nbsp;•&nbsp;
                <strong>Quality Tier:</strong> {chunksPlan.quality_tier}
                &nbsp;•&nbsp;
                <strong>Ranking Strategy:</strong> {chunksPlan.ranking_strategy}
                {chunkPlanStats && (
                  <>
                    &nbsp;•&nbsp;
                    <strong>Estimated Total:</strong> {chunkPlanStats.total.toLocaleString()}
                    {chunkPlanCoverage !== null && (
                      <>
                        &nbsp;•&nbsp;
                        <strong>Coverage:</strong> {chunkPlanCoverage}%
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Agent Alignment */}
          {agentAlignment && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Agent Alignment
              </h5>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
              }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px' }}>
                  <h6 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                    Facts Agent
                  </h6>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    <strong>Highlights</strong>
                    <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
                      {(agentAlignment.facts?.highlights ?? []).length > 0 ? (
                        agentAlignment.facts?.highlights?.map((item, idx) => (
                          <li key={`facts-highlight-${idx}`} style={{ marginBottom: '4px' }}>
                            {item}
                          </li>
                        ))
                      ) : (
                        <li style={{ listStyle: 'none', color: '#94a3b8' }}>No highlights captured</li>
                      )}
                    </ul>
                    <strong>Open Questions</strong>
                    <ul style={{ margin: '4px 0', padding: '0 0 0 16px' }}>
                      {(agentAlignment.facts?.open_questions ?? []).length > 0 ? (
                        agentAlignment.facts?.open_questions?.map((item, idx) => (
                          <li key={`facts-question-${idx}`} style={{ marginBottom: '4px' }}>
                            {item}
                          </li>
                        ))
                      ) : (
                        <li style={{ listStyle: 'none', color: '#94a3b8' }}>No open questions</li>
                      )}
                    </ul>
                  </div>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px' }}>
                  <h6 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                    Cards Agent
                  </h6>
                  <div style={{ fontSize: '12px', color: '#475569' }}>
                    <strong>Assets</strong>
                    <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
                      {(agentAlignment.cards?.assets ?? []).length > 0 ? (
                        agentAlignment.cards?.assets?.map((item, idx) => (
                          <li key={`cards-asset-${idx}`} style={{ marginBottom: '4px' }}>
                            {item}
                          </li>
                        ))
                      ) : (
                        <li style={{ listStyle: 'none', color: '#94a3b8' }}>No assets identified</li>
                      )}
                    </ul>
                    <strong>Open Questions</strong>
                    <ul style={{ margin: '4px 0', padding: '0 0 0 16px' }}>
                      {(agentAlignment.cards?.open_questions ?? []).length > 0 ? (
                        agentAlignment.cards?.open_questions?.map((item, idx) => (
                          <li key={`cards-question-${idx}`} style={{ marginBottom: '4px' }}>
                            {item}
                          </li>
                        ))
                      ) : (
                        <li style={{ listStyle: 'none', color: '#94a3b8' }}>No open questions</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cost Breakdown */}
          {isRecord(costBreakdown) && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Cost Breakdown
              </h5>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: '#475569' }}>
                {['research', 'glossary', 'chunks', 'total'].map((key) => (
                  <div key={key} style={{ minWidth: '140px' }}>
                    <div style={{ textTransform: 'capitalize', color: '#64748b', marginBottom: '2px' }}>
                      {key === 'total' ? 'Total' : `${key.charAt(0).toUpperCase()}${key.slice(1)}`}
                    </div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                      {typeof costBreakdown[key] === 'number'
                        ? formatCurrency(costBreakdown[key] as number)
                        : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

