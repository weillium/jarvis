'use client';

import type { BlueprintResearchPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatCurrency, formatPurpose } from './blueprint-display-utils';

interface ResearchPlanTableProps {
  researchPlan: BlueprintResearchPlan;
}

export function ResearchPlanTable({ researchPlan }: ResearchPlanTableProps) {
  return (
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
  );
}

