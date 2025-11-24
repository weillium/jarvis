'use client';

import { useState } from 'react';
import { CardDisplay } from './card-display';
import type { CardPayload } from '@/shared/types/card';
import { useUpdateCardActiveStatusMutation } from '@/shared/hooks/use-mutations';
import { useCardAuditLog } from '@/shared/hooks/use-card-audit-log';
import { CardAuditHistory } from './card-audit-history';
import {
  YStack,
  XStack,
  Button,
  Alert,
  Modal,
  Textarea,
  Body,
  Label,
  Badge,
  ModalContent,
  FormField,
  ButtonGroup,
} from '@jarvis/ui-core';

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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Moderate Card"
      description="Review the content and provide context if you decide to deactivate the card."
      maxWidth={720}
      showCloseButton={!updateCardStatus.isPending}
    >
      <ModalContent description="Review the card content and optionally provide context before deactivating.">
        <YStack gap="$5" width="100%" minWidth={0}>
          <XStack justifyContent="center" width="100%" minWidth={0} maxWidth="100%">
            <CardDisplay card={cardPayload} timestamp={timestamp} allowShrink={true} />
          </XStack>

          {mutationError && (
            <Alert variant="error">
              <Body size="sm">{mutationError}</Body>
            </Alert>
          )}

          <FormField label="Moderation reason (optional)">
            <Textarea
              id="moderation-reason"
              value={reason}
              onChange={(e: any) => setReason(e.target.value)}
              rows={4}
              placeholder="Add context for deactivating this card..."
              minHeight={120}
            />
          </FormField>

          <XStack gap="$3" alignItems="center" justifyContent="space-between" flexWrap="wrap">
            <Button
              variant={showHistory ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowHistory((previous) => !previous)}
            >
              {showHistory ? 'Hide moderation history' : 'View moderation history'}
            </Button>

            <ButtonGroup wrap={false}>
              <Button variant="outline" onClick={handleClose} disabled={updateCardStatus.isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeactivate} disabled={updateCardStatus.isPending}>
                {updateCardStatus.isPending ? 'Deactivating…' : 'Deactivate card'}
              </Button>
            </ButtonGroup>
          </XStack>

          {showHistory && (
            <YStack borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$4" width="100%" minWidth={0}>
              <Label size="sm">Moderation history</Label>
              <CardAuditHistory entries={auditEntries} isLoading={auditLoading} error={auditErrorMessage} />
            </YStack>
          )}
        </YStack>
      </ModalContent>
    </Modal>
  );
}
