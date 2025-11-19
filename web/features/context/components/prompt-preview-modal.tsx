'use client';

import { YStack, XStack, Text, Button, Card, Modal } from '@jarvis/ui-core';

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
      <YStack gap="$5" flex={1}>

          {/* Event Info */}
          <Card variant="outlined" backgroundColor="$gray1" padding="$4">
            <Text fontSize="$4" fontWeight="600" color="$color" marginBottom="$2" margin={0}>
              Event Information
            </Text>
            <YStack gap="$1" fontSize="$3" color="$gray11">
              <Text margin={0}>
                <Text fontWeight="600" margin={0}>Title:</Text> {promptPreview.event.title}
              </Text>
              <Text margin={0}>
                <Text fontWeight="600" margin={0}>Topic:</Text> {promptPreview.event.topic}
              </Text>
              {promptPreview.event.hasDocuments && (
                <Text margin={0}>
                  <Text fontWeight="600" margin={0}>Documents:</Text> {promptPreview.event.documentCount} document(s) available
                </Text>
              )}
            </YStack>
          </Card>

          {/* User Prompt */}
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
              <Text
                fontSize="$2"
                color="$gray9"
                whiteSpace="pre-wrap"
                fontFamily="$mono"
                margin={0}
              >
                {promptPreview.user}
              </Text>
            </YStack>
          </YStack>

          {/* Modal Actions */}
          <XStack
            gap="$3"
            justifyContent="flex-end"
            borderTopWidth={1}
            borderTopColor="$borderColor"
            paddingTop="$4"
          >
            <Button
              variant="outline"
              onPress={onClose}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={onConfirm}
              disabled={isRegenerating}
              backgroundColor={isRegenerating ? '$gray5' : '$green11'}
            >
              {isRegenerating ? 'Starting...' : 'Confirm'}
            </Button>
          </XStack>
      </YStack>
    </Modal>
  );
}

