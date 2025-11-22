'use client';

import type { BlueprintChunksPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatPurpose } from './blueprint-display-utils';
import {
  YStack,
  Heading,
  Body,
  DataTable,
} from '@jarvis/ui-core';

interface ChunksPlanTableProps {
  chunksPlan: BlueprintChunksPlan;
  chunkPlanStats: {
    total: number;
  } | null;
}

export function ChunksPlanTable({
  chunksPlan,
  chunkPlanStats,
}: ChunksPlanTableProps) {
  const columns = [
    {
      key: 'label',
      header: 'Label',
      flex: 1.5,
      minWidth: 200,
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
      <Heading level={4}>
        Chunks Plan ({chunkPlanStats ? chunkPlanStats.total.toLocaleString() : '0'})
      </Heading>
      <Body size="sm" tone="muted">
        <Body size="sm" weight="bold">
          Ranking Strategy:
        </Body>{' '}
        {chunksPlan.ranking_strategy}
      </Body>
      <DataTable
        columns={columns}
        data={chunksPlan.sources}
        size="sm"
      />
    </YStack>
  );
}
