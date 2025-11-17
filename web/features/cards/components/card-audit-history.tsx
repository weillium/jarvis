'use client';

import type { CardAuditLogEntry } from '@/shared/types/card';

interface CardAuditHistoryProps {
  entries: CardAuditLogEntry[];
  isLoading: boolean;
  error: string | null;
}

export function CardAuditHistory({ entries, isLoading, error }: CardAuditHistoryProps) {
  if (isLoading) {
    return (
      <div
        style={{
          fontSize: '12px',
          color: '#64748b',
          padding: '8px 0',
        }}
      >
        Loading history…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          fontSize: '12px',
          color: '#b91c1c',
          padding: '8px 0',
        }}
      >
        {error}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div
        style={{
          fontSize: '12px',
          color: '#64748b',
          padding: '8px 0',
        }}
      >
        No moderation history yet.
      </div>
    );
  }

  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {entries.map((entry) => (
        <li key={entry.id} style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
          <div>
            <strong>{entry.action}</strong> · {new Date(entry.created_at).toLocaleString()}
          </div>
          {entry.reason && <div style={{ color: '#334155' }}>Reason: {entry.reason}</div>}
        </li>
      ))}
    </ul>
  );
}





