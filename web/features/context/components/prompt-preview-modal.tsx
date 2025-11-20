'use client';

import {
  YStack,
  XStack,
  Text,
  Body,
  Button,
  Card,
  Modal,
  ModalContent,
  ButtonGroup,
} from '@jarvis/ui-core';

interface PromptPreviewModalProps {
  isOpen: boolean;
  promptPreview: {
    system: string;
    user: string;
    event: {
      title: string;
      topic: string;
      hasDocuments: boolean;
      documentCount: number;
    };
  } | null;
  isRegenerating: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PromptPreviewModal({
  isOpen,
  promptPreview,
  isRegenerating,
  onClose,
  onConfirm,
}: PromptPreviewModalProps) {
  if (!isOpen || !promptPreview) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Prompt Before Generation"
      maxWidth={900}
      showCloseButton={!isRegenerating}
    >
      <ModalContent
        title="Confirm Prompt Before Generation"
        description="Review the generated prompt to ensure it reflects the latest event details before starting."
      >
        <YStack gap="$5" flex={1}>
          <Card variant="outlined" backgroundColor="$gray1" padding="$4">
            <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
              Event Information
            </Text>
            <YStack gap="$1">
              <Text margin={0}>
                <Text fontWeight="600" margin={0}>
                  Title:
                </Text>{' '}
                {promptPreview.event.title}
              </Text>
              <Text margin={0}>
                <Text fontWeight="600" margin={0}>
                  Topic:
                </Text>{' '}
                {promptPreview.event.topic}
              </Text>
              {promptPreview.event.hasDocuments && (
                <Text margin={0}>
                  <Text fontWeight="600" margin={0}>
                    Documents:
                  </Text>{' '}
                  {promptPreview.event.documentCount} document(s) available
                </Text>
              )}
            </YStack>
          </Card>

          <YStack flex={1} gap="$2">
            <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
              User Prompt
            </Text>
            <YStack
              backgroundColor="$gray1"
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$2"
              padding="$3"
              maxHeight={300}
              overflow="scroll"
            >
              <Body size="sm" tone="muted" mono whitespace="preWrap">
                {promptPreview.user}
              </Body>
            </YStack>
          </YStack>

          <ButtonGroup>
            <Button variant="outline" onClick={onClose} disabled={isRegenerating}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm} disabled={isRegenerating} backgroundColor={isRegenerating ? '$gray5' : '$green11'}>
              {isRegenerating ? 'Starting…' : 'Confirm'}
            </Button>
          </ButtonGroup>
        </YStack>
      </ModalContent>
    </Modal>
  );
}
