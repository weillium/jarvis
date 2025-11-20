'use client';

import type { BlueprintGlossaryPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatPurpose } from './blueprint-display-utils';
import { YStack, Heading, Body, DataTable } from '@jarvis/ui-core';

interface GlossaryPlanTableProps {
  glossaryPlan: BlueprintGlossaryPlan;
}

export function GlossaryPlanTable({ glossaryPlan }: GlossaryPlanTableProps) {
  const columns = [
    {
      key: 'term',
      header: 'Term',
      flex: 2,
      minWidth: 200,
    },
    {
      key: 'is_acronym',
      header: 'Acronym',
      flex: 1,
      render: (row: BlueprintGlossaryPlan['terms'][number]) => (row.is_acronym ? 'Yes' : 'No'),
    },
    {
      key: 'category',
      header: 'Category',
      flex: 1,
    },
    {
      key: 'priority',
      header: 'Priority',
      flex: 1,
    },
    {
      key: 'agent_utility',
      header: 'Serves Agents',
      flex: 2,
      render: (row: BlueprintGlossaryPlan['terms'][number]) =>
        formatPurpose(
          Array.isArray(row.agent_utility) ? row.agent_utility : undefined
        ),
    },
  ];

  return (
    <YStack gap="$3">
      <Heading level={4}>Glossary Plan</Heading>
      <DataTable columns={columns} data={glossaryPlan.terms} size="sm" />
      <Body size="sm" tone="muted">
        <Body size="sm" weight="bold">
          Estimated Count:
        </Body>{' '}
        {glossaryPlan.estimated_count}
      </Body>
    </YStack>
  );
}
