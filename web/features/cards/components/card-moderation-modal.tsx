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
  const [mutationError, setMutationError] = useState<string | null>(null);

  const updateCardStatus = useUpdateCardActiveStatusMutation(eventId);
  const {
    data: auditEntries = [],
    isLoading: auditLoading,
    error: auditError,
  } = useCardAuditLog(eventId, cardId, isOpen);
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
      maxWidth={1200}
      showCloseButton={!updateCardStatus.isPending}
    >
      <ModalContent>
        <XStack gap="$6" width="100%" minWidth={0} alignItems="flex-start">
          <YStack width={360} minWidth={360} flexShrink={0}>
            <CardDisplay card={cardPayload} timestamp={timestamp} allowShrink={false} />
          </YStack>

          <YStack flex={1} minWidth={0} gap="$4" maxWidth={400}>
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

            <ButtonGroup wrap={false}>
              <Button variant="outline" onClick={handleClose} disabled={updateCardStatus.isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeactivate} disabled={updateCardStatus.isPending}>
                {updateCardStatus.isPending ? 'Deactivating…' : 'Deactivate card'}
              </Button>
            </ButtonGroup>
          </YStack>

          <YStack width={300} minWidth={300} flexShrink={0} gap="$3" maxHeight="calc(90vh - 200px)" overflow="scroll">
            <Label size="sm">Moderation history</Label>
            <CardAuditHistory entries={auditEntries} isLoading={auditLoading} error={auditErrorMessage} />
          </YStack>
        </XStack>
      </ModalContent>
    </Modal>
  );
}
