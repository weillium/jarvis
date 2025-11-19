'use client';

import { useState } from 'react';
import { CardDisplay } from './card-display';
import type { CardPayload } from '@/shared/types/card';
import { useUpdateCardActiveStatusMutation } from '@/shared/hooks/use-mutations';
import { useCardAuditLog } from '@/shared/hooks/use-card-audit-log';
import { CardAuditHistory } from './card-audit-history';
import { YStack, XStack, Text, Button, Alert, Modal, Textarea } from '@jarvis/ui-core';

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
      maxWidth={720}
      showCloseButton={!updateCardStatus.isPending}
    >
      <YStack gap="$6">
        <Text fontSize="$3" color="$gray11" margin={0}>
          Review the content and provide a reason if you choose to deactivate.
        </Text>

          <XStack justifyContent="center">
            <CardDisplay card={cardPayload} timestamp={timestamp} />
          </XStack>

          {mutationError && (
            <Alert variant="error">
              <Text fontSize="$2" margin={0}>{mutationError}</Text>
            </Alert>
          )}

          <YStack gap="$4">
            <Text
              htmlFor="moderation-reason"
              as="label"
              fontSize="$3"
              fontWeight="600"
              color="$gray9"
              display="block"
            >
              Moderation reason (optional)
            </Text>
            <Textarea
              id="moderation-reason"
              value={reason}
              onChange={(e: any) => setReason(e.target.value)}
              rows={4}
              placeholder="Add context for deactivating this card..."
              minHeight={120}
            />
          </YStack>

          <XStack
            gap="$3"
            alignItems="center"
            justifyContent="space-between"
            flexWrap="wrap"
          >
            <Button
              variant="primary"
              size="sm"
              onPress={() => setShowHistory((previous) => !previous)}
              backgroundColor="$blue2"
              color="$blue11"
            >
              {showHistory ? 'Hide moderation history' : 'View moderation history'}
            </Button>

            <XStack gap="$3">
              <Button
                variant="outline"
                onPress={handleClose}
                disabled={updateCardStatus.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={handleDeactivate}
                disabled={updateCardStatus.isPending}
                backgroundColor="#f97316"
                opacity={updateCardStatus.isPending ? 0.65 : 1}
              >
                {updateCardStatus.isPending ? 'Deactivating…' : 'Deactivate card'}
              </Button>
            </XStack>
          </XStack>

          {showHistory && (
            <YStack
              borderTopWidth={1}
              borderTopColor="$borderColor"
              paddingTop="$4"
            >
              <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$3" margin={0}>
                Moderation history
              </Text>
              <CardAuditHistory
                entries={auditEntries}
                isLoading={auditLoading}
                error={auditErrorMessage}
              />
            </YStack>
          )}
        </YStack>
    </Modal>
  );
}


