'use client';

import { YStack, XStack, Button, Modal, Body, Label, ModalContent, ButtonGroup } from '@jarvis/ui-core';

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
        <YStack gap="$3">
          {options.map((option) => (
            <XStack
              key={option.key}
              as="label"
              alignItems="flex-start"
              gap="$3"
              padding="$4"
              borderWidth={2}
              borderColor={selection[option.key] ? '$blue6' : '$borderColor'}
              borderRadius="$3"
              backgroundColor={selection[option.key] ? '$blue2' : '$background'}
              cursor={isSubmitting ? 'not-allowed' : 'pointer'}
              opacity={isSubmitting ? 0.6 : 1}
              hoverStyle={
                !isSubmitting
                  ? {
                      borderColor: selection[option.key] ? '$blue7' : '$borderColorHover',
                    }
                  : undefined
              }
            >
              <Button
                variant={selection[option.key] ? 'primary' : 'outline'}
                size="sm"
                disabled={isSubmitting}
                onPress={() =>
                  !isSubmitting &&
                  onSelectionChange({
                    ...selection,
                    [option.key]: !selection[option.key],
                  })
                }
              >
                {selection[option.key] ? 'Selected' : 'Select'}
              </Button>
              <YStack flex={1} gap="$1">
                <Label size="md">{option.label}</Label>
                <Body tone="muted">{option.description}</Body>
              </YStack>
            </XStack>
          ))}
        </YStack>

        <ButtonGroup>
          <Button type="button" variant="outline" onPress={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onPress={onConfirm} disabled={isSubmitting || !hasSelection}>
            {isSubmitting ? 'Starting…' : 'Start Selected Agents'}
          </Button>
        </ButtonGroup>
      </ModalContent>
    </Modal>
  );
}
