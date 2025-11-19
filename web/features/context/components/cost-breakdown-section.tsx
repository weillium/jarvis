'use client';

import { isRecord } from './blueprint-display-utils';
import { formatCurrency } from './blueprint-display-utils';

interface CostBreakdownSectionProps {
  costBreakdown: Record<string, unknown> | null;
}

export function CostBreakdownSection({ costBreakdown }: CostBreakdownSectionProps) {
  if (!isRecord(costBreakdown)) {
    return null;
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <h5 style={{
        fontSize: '14px',
        fontWeight: '600',
        color: '#0f172a',
        marginBottom: '8px',
      }}>
        Cost Breakdown
      </h5>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: '#475569' }}>
        {['research', 'glossary', 'chunks', 'total'].map((key) => (
          <div key={key} style={{ minWidth: '140px' }}>
            <div style={{ textTransform: 'capitalize', color: '#64748b', marginBottom: '2px' }}>
              {key === 'total' ? 'Total' : `${key.charAt(0).toUpperCase()}${key.slice(1)}`}
            </div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>
              {typeof costBreakdown[key] === 'number'
                ? formatCurrency(costBreakdown[key] as number)
                : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

