'use client';

import type { BlueprintChunksPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatPurpose } from './blueprint-display-utils';
import { YStack, XStack, Text } from '@jarvis/ui-core';

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
    <YStack marginBottom="$5">
      <Text fontSize="$3" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
        Chunks Plan
      </Text>
      {chunkPlanStats && (
        <XStack flexWrap="wrap" gap="$3" fontSize="$2" color="$gray9" marginBottom="$3">
          <Text margin={0}>
            <Text fontWeight="600" margin={0}>{chunksPlan.sources.length}</Text> planned sources
          </Text>
          <Text margin={0}>
            <Text fontWeight="600" margin={0}>{chunkPlanStats.total.toLocaleString()}</Text> estimated chunks
          </Text>
          <Text margin={0}>
            <Text fontWeight="600" margin={0}>{chunkPlanStats.facts.toLocaleString()}</Text> for facts
          </Text>
          <Text margin={0}>
            <Text fontWeight="600" margin={0}>{chunkPlanStats.cards.toLocaleString()}</Text> for cards
          </Text>
          {chunkPlanCoverage !== null && (
            <Text margin={0}>
              <Text fontWeight="600" margin={0}>{chunkPlanCoverage}%</Text> of target coverage
            </Text>
          )}
        </XStack>
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
      <Text fontSize="$2" color="$gray9" marginTop="$2" margin={0}>
        <Text fontWeight="600" margin={0}>Target Count (Plan):</Text> {chunksPlan.target_count}
        &nbsp;•&nbsp;
        <Text fontWeight="600" margin={0}>Quality Tier:</Text> {chunksPlan.quality_tier}
        &nbsp;•&nbsp;
        <Text fontWeight="600" margin={0}>Ranking Strategy:</Text> {chunksPlan.ranking_strategy}
        {chunkPlanStats && (
          <>
            &nbsp;•&nbsp;
            <Text fontWeight="600" margin={0}>Estimated Total:</Text> {chunkPlanStats.total.toLocaleString()}
            {chunkPlanCoverage !== null && (
              <>
                &nbsp;•&nbsp;
                <Text fontWeight="600" margin={0}>Coverage:</Text> {chunkPlanCoverage}%
              </>
            )}
          </>
        )}
      </Text>
    </YStack>
  );
}

