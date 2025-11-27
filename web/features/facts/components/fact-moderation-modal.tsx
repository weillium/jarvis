'use client';

import { useState } from 'react';
import { useUpdateFactActiveStatusMutation } from '@/shared/hooks/use-mutations';
import { useFactAuditLog } from '@/shared/hooks/use-fact-audit-log';
import { FactAuditHistory } from './fact-audit-history';
import { ClientDateFormatter } from '@/shared/components/client-date-formatter';
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
  Card,
  Badge,
} from '@jarvis/ui-core';

interface FactModerationModalProps {
  eventId: string;
  factKey: string;
  factValue: any;
  confidence: number;
  updatedAt: string;
  isOpen: boolean;
  onClose: () => void;
}

export function FactModerationModal({
  eventId,
  factKey,
  factValue,
  confidence,
  updatedAt,
  isOpen,
  onClose,
}: FactModerationModalProps) {
  const [reason, setReason] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const updateFactStatus = useUpdateFactActiveStatusMutation(eventId);
  const {
    data: auditEntries = [],
    isLoading: auditLoading,
    error: auditError,
  } = useFactAuditLog(eventId, factKey, isOpen);
  const auditErrorMessage =
    auditError instanceof Error ? auditError.message : typeof auditError === 'string' ? auditError : null;

  if (!isOpen) {
    return null;
  }

  const handleClose = () => {
    if (updateFactStatus.isPending) {
      return;
    }
    setReason('');
    setMutationError(null);
    onClose();
  };

  const handleDeactivate = async () => {
    setMutationError(null);
    try {
      await updateFactStatus.mutateAsync({
        factKey,
        isActive: false,
        reason: reason.trim() || undefined,
      });
      setReason('');
      handleClose();
    } catch (error) {
      console.error('[FactModerationModal] Failed to deactivate fact:', error);
      setMutationError(error instanceof Error ? error.message : 'Failed to deactivate fact');
    }
  };

  const confidenceVariant = confidence >= 0.7 ? 'green' : confidence >= 0.5 ? 'yellow' : 'red';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Moderate Fact"
      description="Review the content and provide context if you decide to deactivate the fact."
      maxWidth={1200}
      showCloseButton={!updateFactStatus.isPending}
    >
      <ModalContent>
        <XStack gap="$6" width="100%" minWidth={0} alignItems="flex-start">
          <YStack width={360} minWidth={360} flexShrink={0}>
            <Card variant="outlined" padding="$4">
              <YStack gap="$3">
                <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
                  <Body size="md" weight="bold" color="$color" transform="capitalize" margin={0}>
                    {factKey.replace(/_/g, ' ')}
                  </Body>
                  <Badge variant={confidenceVariant} size="sm">
                    {(confidence * 100).toFixed(0)}%
                  </Badge>
                </XStack>
                <Body tone="muted" whitespace="preWrap" mono={typeof factValue !== 'string'}>
                  {typeof factValue === 'string'
                    ? factValue
                    : JSON.stringify(factValue, null, 2)}
                </Body>
                <Body size="sm" tone="muted">
                  Updated <ClientDateFormatter date={updatedAt} format="localeTimeString" />
                </Body>
              </YStack>
            </Card>
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
                placeholder="Add context for deactivating this fact..."
                minHeight={120}
              />
            </FormField>

            <ButtonGroup wrap={false}>
              <Button variant="outline" onClick={handleClose} disabled={updateFactStatus.isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDeactivate} disabled={updateFactStatus.isPending}>
                {updateFactStatus.isPending ? 'Deactivating…' : 'Deactivate fact'}
              </Button>
            </ButtonGroup>
          </YStack>

          <YStack width={300} minWidth={300} flexShrink={0} gap="$3" maxHeight="calc(90vh - 200px)" overflow="scroll">
            <Label size="sm">Moderation history</Label>
            <FactAuditHistory entries={auditEntries} isLoading={auditLoading} error={auditErrorMessage} />
          </YStack>
        </XStack>
      </ModalContent>
    </Modal>
  );
}

