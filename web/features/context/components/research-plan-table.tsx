'use client';

import type { BlueprintResearchPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatCurrency, formatPurpose } from './blueprint-display-utils';
import { YStack, Heading, Body, DataTable } from '@jarvis/ui-core';

interface ResearchPlanTableProps {
  researchPlan: BlueprintResearchPlan;
}

export function ResearchPlanTable({ researchPlan }: ResearchPlanTableProps) {
  const columns = [
    {
      key: 'query',
      header: 'Query',
      flex: 2,
      minWidth: 220,
    },
    {
      key: 'api',
      header: 'API',
      flex: 1,
      render: (row: BlueprintResearchPlan['queries'][number]) =>
        row.api ? row.api.toUpperCase() : '—',
    },
    {
      key: 'priority',
      header: 'Priority',
      flex: 1,
    },
    {
      key: 'estimated_cost',
      header: 'Estimated Cost',
      flex: 1,
      render: (row: BlueprintResearchPlan['queries'][number]) =>
        formatCurrency(row.estimated_cost),
    },
    {
      key: 'agent_utility',
      header: 'Serves Agents',
      flex: 2,
      render: (row: BlueprintResearchPlan['queries'][number]) =>
        formatPurpose(
          Array.isArray(row.agent_utility) ? row.agent_utility : undefined
        ),
    },
    {
      key: 'provenance_hint',
      header: 'Provenance',
      flex: 2,
      truncate: true,
      render: (row: BlueprintResearchPlan['queries'][number]) =>
        row.provenance_hint && row.provenance_hint.trim().length > 0
          ? row.provenance_hint
          : '—',
    },
  ];

  return (
    <YStack gap="$3">
      <Heading level={4}>Research Plan</Heading>
      <DataTable
        columns={columns}
        data={researchPlan.queries}
        size="sm"
      />
      <Body size="sm" tone="muted">
        <Body size="sm" weight="bold">
          Total Searches:
        </Body>{' '}
        {researchPlan.total_searches} &nbsp;•&nbsp;
        <Body size="sm" weight="bold">
          Estimated Total Cost:
        </Body>{' '}
        {formatCurrency(researchPlan.estimated_total_cost)}
      </Body>
    </YStack>
  );
}
