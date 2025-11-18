'use client';

import { useState } from 'react';
import { YStack, XStack, Text, Button, Input, Textarea, Alert } from '@jarvis/ui-core';

interface TestTranscriptModalProps {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
  onSend: (text: string, speaker: string) => Promise<void>;
}

export function TestTranscriptModal({
  eventId,
  isOpen,
  onClose,
  onSend,
}: TestTranscriptModalProps) {
  const [text, setText] = useState('');
  const [speaker, setSpeaker] = useState('Test User');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Transcript text is required');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await onSend(text.trim(), speaker.trim() || 'Test User');
      setText('');
      setSpeaker('Test User');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send test transcript');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending) {
      setText('');
      setSpeaker('Test User');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <YStack
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor="rgba(0, 0, 0, 0.5)"
      alignItems="center"
      justifyContent="center"
      zIndex={1000}
      onPress={handleClose}
    >
      <Card
        padding="$6"
        width="90%"
        maxWidth={600}
        onPress={(e: any) => e.stopPropagation()}
      >
        <YStack gap="$5">
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize="$5" fontWeight="600" color="$color" margin={0}>
              Send Test Transcript
            </Text>
            <Button
              variant="ghost"
              size="sm"
              onPress={handleClose}
              disabled={isSending}
              padding="$1"
              width={32}
              height={32}
            >
              <Text fontSize="$7">×</Text>
            </Button>
          </XStack>

          <form onSubmit={handleSubmit}>
            <YStack gap="$5">
              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="500" color="$gray9">
                  Speaker Name
                </Text>
                <Input
                  type="text"
                  value={speaker}
                  onChange={(e: any) => setSpeaker(e.target.value)}
                  placeholder="Test User"
                  disabled={isSending}
                />
              </YStack>

              <YStack gap="$2">
                <Text fontSize="$3" fontWeight="500" color="$gray9">
                  Transcript Text
                </Text>
                <Textarea
                  value={text}
                  onChange={(e: any) => setText(e.target.value)}
                  placeholder="Enter test transcript text here..."
                  disabled={isSending}
                  rows={6}
                  minHeight={120}
                />
              </YStack>

              {error && (
                <Alert variant="error">
                  {error}
                </Alert>
              )}

              <XStack gap="$3" justifyContent="flex-end">
                <Button
                  type="button"
                  variant="outline"
                  onPress={handleClose}
                  disabled={isSending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSending || !text.trim()}
                >
                  {isSending ? 'Sending...' : 'Send Transcript'}
                </Button>
              </XStack>
            </YStack>
          </form>
        </YStack>
      </Card>
    </YStack>
  );
}

