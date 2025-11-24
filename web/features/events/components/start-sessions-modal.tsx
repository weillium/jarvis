'use client';

import { YStack, XStack, Button, Modal, Body, Label, ModalContent, ButtonGroup, Card, Text } from '@jarvis/ui-core';

interface StartSessionsModalProps {
  isOpen: boolean;
  selection: { transcript: boolean; cards: boolean; facts: boolean };
  onSelectionChange: (next: { transcript: boolean; cards: boolean; facts: boolean }) => void;
  onConfirm: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export function StartSessionsModal({
  isOpen,
  selection,
  onSelectionChange,
  onConfirm,
  onClose,
  isSubmitting,
}: StartSessionsModalProps) {
  const options: Array<{
    key: 'transcript' | 'cards' | 'facts';
    label: string;
    description: string;
  }> = [
    {
      key: 'transcript',
      label: 'Transcript Agent',
      description: 'Captures live audio and produces the transcript stream.',
    },
    {
      key: 'cards',
      label: 'Cards Agent',
      description: 'Generates realtime cards and summaries from transcript context.',
    },
    {
      key: 'facts',
      label: 'Facts Agent',
      description: 'Maintains the structured facts store for downstream consumption.',
    },
  ];

  const hasSelection = selection.transcript || selection.cards || selection.facts;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start Agent Sessions" maxWidth={600} showCloseButton={!isSubmitting}>
      <ModalContent description="Select which agent sessions you want to start. You can mix and match multiple agents." spacing="$5">
        <YStack gap="$3" marginBottom="$5">
          {options.map((option) => {
            const isSelected = selection[option.key];
            const handleToggle = () => {
              if (isSubmitting) return;
              onSelectionChange({
                ...selection,
                [option.key]: !selection[option.key],
              });
            };
            return (
              <Card
                key={option.key}
                variant="outlined"
                onClick={handleToggle}
                cursor={isSubmitting ? 'not-allowed' : 'pointer'}
                opacity={isSubmitting ? 0.6 : 1}
                borderWidth={2}
                borderColor={isSelected ? '$blue6' : '$borderColor'}
                backgroundColor={isSelected ? '$blue2' : '$background'}
                padding="$4"
              >
                <XStack alignItems="center" gap="$3">
                  <Text fontSize="$6" color={isSelected ? '$blue11' : '$gray8'}>
                    {isSelected ? '✓' : '○'}
                  </Text>
                  <YStack flex={1} gap="$1">
                    <Label size="md">{option.label}</Label>
                    <Body tone="muted">{option.description}</Body>
                  </YStack>
                </XStack>
              </Card>
            );
          })}
        </YStack>

        <ButtonGroup>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} disabled={isSubmitting || !hasSelection}>
            {isSubmitting ? 'Starting…' : 'Start Selected Agents'}
          </Button>
        </ButtonGroup>
      </ModalContent>
    </Modal>
  );
}
