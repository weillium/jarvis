'use client';

import type { BlueprintChunksPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatPurpose } from './blueprint-display-utils';

interface ChunksPlanTableProps {
  chunksPlan: BlueprintChunksPlan;
  chunkPlanStats: {
    total: number;
    facts: number;
    cards: number;
  } | null;
  chunkPlanCoverage: number | null;
}

export function ChunksPlanTable({ chunksPlan, chunkPlanStats, chunkPlanCoverage }: ChunksPlanTableProps) {
  return (
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
  );
}

