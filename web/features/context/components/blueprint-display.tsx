'use client';

import { useState } from 'react';
import { useBlueprintFullQuery } from '@/shared/hooks/use-blueprint-full-query';
import {
  isRecord,
  isStringArray,
  asResearchPlan,
  asGlossaryPlan,
  asChunksPlan,
  asAgentAlignment,
  asAudienceProfile,
  type BlueprintAudienceProfile,
} from './blueprint-display-utils';
import { ResearchPlanTable } from './research-plan-table';
import { GlossaryPlanTable } from './glossary-plan-table';
import { ChunksPlanTable } from './chunks-plan-table';
import { AudienceProfileSection } from './audience-profile-section';
import { AgentAlignmentSection } from './agent-alignment-section';
import { CostBreakdownSection } from './cost-breakdown-section';

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

  const audienceProfile = asAudienceProfile(
    blueprintJson ? blueprintJson['audience_profile'] : undefined
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
          {/* Audience Profile */}
          {audienceProfile && (
            <AudienceProfileSection audienceProfile={audienceProfile} />
          )}

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
            <ResearchPlanTable researchPlan={researchPlan} />
          )}

          {/* Glossary Plan */}
          {glossaryPlan && (
            <GlossaryPlanTable glossaryPlan={glossaryPlan} />
          )}

          {/* Chunks Plan */}
          {chunksPlan && (
            <ChunksPlanTable
              chunksPlan={chunksPlan}
              chunkPlanStats={chunkPlanStats}
              chunkPlanCoverage={chunkPlanCoverage}
            />
          )}

          {/* Agent Alignment */}
          {agentAlignment && (
            <AgentAlignmentSection agentAlignment={agentAlignment} />
          )}

          {/* Cost Breakdown */}
          <CostBreakdownSection costBreakdown={costBreakdown} />
        </div>
      )}
    </div>
  );
}

