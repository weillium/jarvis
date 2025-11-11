'use client';

import { useState } from 'react';
import { useUpdateCardActiveStatusMutation } from '@/shared/hooks/use-mutations';
import { useCardAuditLog } from '@/shared/hooks/use-card-audit-log';
import { CardAuditHistory } from './card-audit-history';

interface CardModerationPanelProps {
  eventId: string;
  cardId: string;
}

export function CardModerationPanel({ eventId, cardId }: CardModerationPanelProps) {
  const [reason, setReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const updateCardStatus = useUpdateCardActiveStatusMutation(eventId);
  const {
    data: auditEntries = [],
    isLoading: auditLoading,
    error: auditError,
  } = useCardAuditLog(eventId, cardId, showHistory);

  const handleDeactivate = async () => {
    setMutationError(null);
    try {
      await updateCardStatus.mutateAsync({ cardId, isActive: false, reason: reason.trim() || undefined });
      setReason('');
    } catch (err) {
      console.error('[CardModerationPanel] Failed to deactivate card:', err);
      setMutationError(err instanceof Error ? err.message : 'Failed to deactivate card');
    }
  };

  return (
    <div
      style={{
        borderTop: '1px solid #e2e8f0',
        paddingTop: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {mutationError && (
        <div
          style={{
            fontSize: '12px',
            color: '#b91c1c',
            background: '#fee2e2',
            borderRadius: '6px',
            padding: '8px 12px',
          }}
        >
          {mutationError}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: '#475569',
          }}
        >
          Moderation reason (optional)
        </label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why are you deactivating this card?"
          rows={3}
          style={{
            width: '100%',
            fontSize: '12px',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #cbd5f5',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={handleDeactivate}
            disabled={updateCardStatus.isPending}
            style={{
              padding: '6px 12px',
              background: '#f97316',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: updateCardStatus.isPending ? 'not-allowed' : 'pointer',
              opacity: updateCardStatus.isPending ? 0.6 : 1,
            }}
          >
            {updateCardStatus.isPending ? 'Deactivating…' : 'Deactivate Card'}
          </button>
          <button
            onClick={() => setShowHistory((previous) => !previous)}
            style={{
              padding: '6px 12px',
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {showHistory ? 'Hide History' : 'Show History'}
          </button>
        </div>
      </div>

      {showHistory && (
        <CardAuditHistory
          entries={auditEntries}
          isLoading={auditLoading}
          error={auditError instanceof Error ? auditError.message : auditError ?? null}
        />
      )}
    </div>
  );
}


