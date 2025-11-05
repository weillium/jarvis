'use client';

import { useState, useEffect } from 'react';

interface BlueprintDisplayProps {
  eventId: string;
  onRegenerate?: () => void;
  embedded?: boolean; // If true, removes expand button and regenerate button
}

interface Blueprint {
  id: string;
  status: string;
  blueprint: any;
  important_details: string[] | null;
  inferred_topics: string[] | null;
  key_terms: string[] | null;
  research_plan: any;
  glossary_plan: any;
  chunks_plan: any;
  target_chunk_count: number | null;
  quality_tier: string | null;
  estimated_cost: number | null;
  created_at: string;
}

export function BlueprintDisplay({
  eventId,
  onRegenerate,
  embedded = false,
}: BlueprintDisplayProps) {
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(embedded); // Auto-expand when embedded

  useEffect(() => {
    async function fetchBlueprint() {
      try {
        const res = await fetch(`/api/context/${eventId}/blueprint`);
        const data = await res.json();
        if (data.ok && data.blueprint) {
          setBlueprint(data.blueprint);
        }
      } catch (err) {
        console.error('Failed to fetch blueprint:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchBlueprint();
    // Poll for blueprint updates (every 3 seconds) to auto-populate when generated
    const interval = setInterval(fetchBlueprint, 3000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Handle regenerate blueprint - just trigger the parent's callback to show prompt preview modal
  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate();
    }
  };

  if (loading) {
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
        {blueprint.target_chunk_count && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
              Target Chunks
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>
              {blueprint.target_chunk_count.toLocaleString()}
            </div>
          </div>
        )}
        {blueprint.quality_tier && (
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
              Quality Tier
            </div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', textTransform: 'capitalize' }}>
              {blueprint.quality_tier}
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
          {blueprint.important_details && blueprint.important_details.length > 0 && (
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
                {blueprint.important_details.map((detail, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Inferred Topics */}
          {blueprint.inferred_topics && blueprint.inferred_topics.length > 0 && (
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
                {blueprint.inferred_topics.map((topic, i) => (
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
          {blueprint.key_terms && blueprint.key_terms.length > 0 && (
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
                {blueprint.key_terms.map((term, i) => (
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
          {blueprint.research_plan && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Research Plan
              </h5>
              <pre style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px',
                color: '#475569',
              }}>
                {JSON.stringify(blueprint.research_plan, null, 2)}
              </pre>
            </div>
          )}

          {/* Glossary Plan */}
          {blueprint.glossary_plan && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Glossary Plan
              </h5>
              <pre style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px',
                color: '#475569',
              }}>
                {JSON.stringify(blueprint.glossary_plan, null, 2)}
              </pre>
            </div>
          )}

          {/* Chunks Plan */}
          {blueprint.chunks_plan && (
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#0f172a',
                marginBottom: '8px',
              }}>
                Chunks Plan
              </h5>
              <pre style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px',
                color: '#475569',
              }}>
                {JSON.stringify(blueprint.chunks_plan, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
