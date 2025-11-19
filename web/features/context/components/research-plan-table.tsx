'use client';

import type { BlueprintResearchPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatCurrency, formatPurpose } from './blueprint-display-utils';
import { YStack, Text } from '@jarvis/ui-core';

interface ResearchPlanTableProps {
  researchPlan: BlueprintResearchPlan;
}

export function ResearchPlanTable({ researchPlan }: ResearchPlanTableProps) {
  return (
    <YStack marginBottom="$5">
      <Text fontSize="$3" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
        Research Plan
      </Text>
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
      <Text fontSize="$2" color="$gray9" marginTop="$2" margin={0}>
        <Text fontWeight="600" margin={0}>Total Searches:</Text> {researchPlan.total_searches} &nbsp;•&nbsp; <Text fontWeight="600" margin={0}>Estimated Total Cost:</Text> {formatCurrency(researchPlan.estimated_total_cost)}
      </Text>
    </YStack>
  );
}

