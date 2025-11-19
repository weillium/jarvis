'use client';

import { YStack, XStack, Text, Button, Modal } from '@jarvis/ui-core';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Start Agent Sessions"
      maxWidth={600}
      showCloseButton={!isSubmitting}
    >
      <YStack gap="$5">
          <Text fontSize="$3" color="$gray11" margin={0}>
            Select which agent sessions you want to start:
          </Text>

          <YStack gap="$3" marginBottom="$6">
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
                <input
                  type="checkbox"
                  checked={selection[option.key]}
                  onChange={(e) => {
                    if (!isSubmitting) {
                      onSelectionChange({
                        ...selection,
                        [option.key]: e.target.checked,
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  style={{
                    marginTop: '2px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                />
                <YStack flex={1} gap="$1">
                  <Text fontSize="$4" fontWeight="600" color="$color" margin={0}>
                    {option.label}
                  </Text>
                  <Text fontSize="$3" color="$gray11" margin={0}>
                    {option.description}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </YStack>

          <XStack gap="$3" justifyContent="flex-end">
            <Button
              type="button"
              variant="outline"
              onPress={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onPress={onConfirm}
              disabled={isSubmitting || !hasSelection}
            >
              {isSubmitting ? 'Starting…' : 'Start Selected Agents'}
            </Button>
          </XStack>
      </YStack>
    </Modal>
  );
}

