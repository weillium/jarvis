'use client';

import { useState } from 'react';
import { CardDisplay } from './card-display';
import type { CardPayload } from '@/shared/types/card';
import { useUpdateCardActiveStatusMutation } from '@/shared/hooks/use-mutations';
import { useCardAuditLog } from '@/shared/hooks/use-card-audit-log';
import { CardAuditHistory } from './card-audit-history';

interface CardModerationModalProps {
  eventId: string;
  cardId: string;
  cardPayload: CardPayload;
  timestamp?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CardModerationModal({
  eventId,
  cardId,
  cardPayload,
  timestamp,
  isOpen,
  onClose,
}: CardModerationModalProps) {
  const [reason, setReason] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const updateCardStatus = useUpdateCardActiveStatusMutation(eventId);
  const {
    data: auditEntries = [],
    isLoading: auditLoading,
    error: auditError,
  } = useCardAuditLog(eventId, cardId, isOpen && showHistory);
  const auditErrorMessage =
    auditError instanceof Error ? auditError.message : typeof auditError === 'string' ? auditError : null;

  if (!isOpen) {
    return null;
  }

  const handleClose = () => {
    if (updateCardStatus.isPending) {
      return;
    }
    setReason('');
    setShowHistory(false);
    setMutationError(null);
    onClose();
  };

  const handleDeactivate = async () => {
    setMutationError(null);
    try {
      await updateCardStatus.mutateAsync({
        cardId,
        isActive: false,
        reason: reason.trim() || undefined,
      });
      setReason('');
      setShowHistory(false);
      handleClose();
    } catch (error) {
      console.error('[CardModerationModal] Failed to deactivate card:', error);
      setMutationError(error instanceof Error ? error.message : 'Failed to deactivate card');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: '24px',
      }}
      onClick={handleClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: 'min(720px, 96vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 40px 80px rgba(15, 23, 42, 0.25)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              Moderate Card
            </h2>
            <p
              style={{
                margin: '8px 0 0 0',
                fontSize: '14px',
                color: '#64748b',
              }}
            >
              Review the content and provide a reason if you choose to deactivate.
            </p>
          </div>

          <button
            onClick={handleClose}
            disabled={updateCardStatus.isPending}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '28px',
              cursor: updateCardStatus.isPending ? 'not-allowed' : 'pointer',
              lineHeight: 1,
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(event) => {
              if (!updateCardStatus.isPending) {
                event.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)';
              }
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <CardDisplay card={cardPayload} timestamp={timestamp} />
        </div>

        {mutationError && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: '13px',
            }}
          >
            {mutationError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label
            htmlFor="moderation-reason"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#334155',
            }}
          >
            Moderation reason (optional)
          </label>
          <textarea
            id="moderation-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder="Add context for deactivating this card..."
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid #cbd5f5',
              fontSize: '14px',
              resize: 'vertical',
              minHeight: '120px',
              color: '#1f2937',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => setShowHistory((previous) => !previous)}
            style={{
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#1d4ed8',
              border: 'none',
              borderRadius: '999px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showHistory ? 'Hide moderation history' : 'View moderation history'}
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={updateCardStatus.isPending}
              style={{
                background: '#ffffff',
                color: '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: '999px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: updateCardStatus.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={updateCardStatus.isPending}
              style={{
                background: '#f97316',
                color: '#ffffff',
                border: 'none',
                borderRadius: '999px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: updateCardStatus.isPending ? 'not-allowed' : 'pointer',
                opacity: updateCardStatus.isPending ? 0.65 : 1,
              }}
            >
              {updateCardStatus.isPending ? 'Deactivating…' : 'Deactivate card'}
            </button>
          </div>
        </div>

        {showHistory && (
          <div
            style={{
              borderTop: '1px solid #e2e8f0',
              paddingTop: '16px',
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: 600,
                color: '#0f172a',
              }}
            >
              Moderation history
            </h3>
            <CardAuditHistory
              entries={auditEntries}
              isLoading={auditLoading}
              error={auditErrorMessage}
            />
          </div>
        )}
      </div>
    </div>
  );
}


