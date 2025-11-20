'use client';

import type { BlueprintChunksPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatPurpose } from './blueprint-display-utils';
import {
  YStack,
  Heading,
  Body,
  StatGroup,
  StatItem,
  DataTable,
} from '@jarvis/ui-core';

interface ChunksPlanTableProps {
  chunksPlan: BlueprintChunksPlan;
  chunkPlanStats: {
    total: number;
    facts: number;
    cards: number;
  } | null;
  chunkPlanCoverage: number | null;
}

export function ChunksPlanTable({
  chunksPlan,
  chunkPlanStats,
  chunkPlanCoverage,
}: ChunksPlanTableProps) {
  const columns = [
    {
      key: 'label',
      header: 'Label',
      flex: 1.5,
      minWidth: 200,
      render: (row: BlueprintChunksPlan['sources'][number]) => (
        <Body weight="medium">{row.label}</Body>
      ),
    },
    {
      key: 'upstream_reference',
      header: 'Upstream Reference',
      flex: 2,
      truncate: true,
      minWidth: 220,
      render: (row: BlueprintChunksPlan['sources'][number]) => row.upstream_reference,
    },
    {
      key: 'expected_format',
      header: 'Expected Format',
      flex: 1,
      render: (row: BlueprintChunksPlan['sources'][number]) =>
        row.expected_format ? row.expected_format : '—',
    },
    {
      key: 'priority',
      header: 'Priority',
      flex: 1,
    },
    {
      key: 'estimated_chunks',
      header: 'Estimated Chunks',
      flex: 1,
      render: (row: BlueprintChunksPlan['sources'][number]) =>
        row.estimated_chunks.toLocaleString(),
    },
    {
      key: 'agent_utility',
      header: 'Agent Utility',
      flex: 2,
      render: (row: BlueprintChunksPlan['sources'][number]) =>
        formatPurpose(row.agent_utility),
    },
  ];

  return (
    <YStack gap="$3">
      <Heading level={4}>Chunks Plan</Heading>
      {chunkPlanStats && (
        <StatGroup>
          <StatItem label="Planned Sources" value={chunksPlan.sources.length} size="sm" />
          <StatItem
            label="Estimated Chunks"
            value={chunkPlanStats.total.toLocaleString()}
            size="sm"
          />
          <StatItem
            label="Facts Allocation"
            value={chunkPlanStats.facts.toLocaleString()}
            size="sm"
          />
          <StatItem
            label="Cards Allocation"
            value={chunkPlanStats.cards.toLocaleString()}
            size="sm"
          />
          {chunkPlanCoverage !== null && (
            <StatItem label="Target Coverage" value={`${chunkPlanCoverage}%`} size="sm" />
          )}
        </StatGroup>
      )}
      <DataTable
        columns={columns}
        data={chunksPlan.sources}
        size="sm"
      />
      <Body size="sm" tone="muted">
        <Body size="sm" weight="bold">
          Target Count (Plan):
        </Body>{' '}
        {chunksPlan.target_count}
        &nbsp;•&nbsp;
        <Body size="sm" weight="bold">
          Quality Tier:
        </Body>{' '}
        {chunksPlan.quality_tier}
        &nbsp;•&nbsp;
        <Body size="sm" weight="bold">
          Ranking Strategy:
        </Body>{' '}
        {chunksPlan.ranking_strategy}
        {chunkPlanStats && (
          <>
            &nbsp;•&nbsp;
            <Body size="sm" weight="bold">
              Estimated Total:
            </Body>{' '}
            {chunkPlanStats.total.toLocaleString()}
            {chunkPlanCoverage !== null && (
              <>
                &nbsp;•&nbsp;
                <Body size="sm" weight="bold">
                  Coverage:
                </Body>{' '}
                {chunkPlanCoverage}%
              </>
            )}
          </>
        )}
      </Body>
    </YStack>
  );
}
