'use client';

import type { BlueprintGlossaryPlan } from '@/shared/hooks/use-blueprint-full-query';
import { formatPurpose } from './blueprint-display-utils';

interface GlossaryPlanTableProps {
  glossaryPlan: BlueprintGlossaryPlan;
}

export function GlossaryPlanTable({ glossaryPlan }: GlossaryPlanTableProps) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h5 style={{
        fontSize: '14px',
        fontWeight: '600',
        color: '#0f172a',
        marginBottom: '8px',
      }}>
        Glossary Plan
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
              {['Term', 'Acronym', 'Category', 'Priority', 'Serves Agents'].map((header) => (
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
            {glossaryPlan.terms.map((term, i) => (
              <tr key={`${term.term}-${i}`}>
                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
                  {term.term}
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                  {term.is_acronym ? 'Yes' : 'No'}
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                  {term.category}
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                  {term.priority}
                </td>
                <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>
                  {formatPurpose(
                    Array.isArray(term.agent_utility) ? term.agent_utility : undefined
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
        <strong>Estimated Count:</strong> {glossaryPlan.estimated_count}
      </div>
    </div>
  );
}

