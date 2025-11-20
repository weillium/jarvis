'use client';

import { useState } from 'react';
import {
  YStack,
  XStack,
  Text,
  Button,
  Input,
  Textarea,
  Alert,
  Modal,
  ModalContent,
  FormField,
  ButtonGroup,
} from '@jarvis/ui-core';

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

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Send Test Transcript" maxWidth={600} showCloseButton={!isSending}>
      <ModalContent description="Send a sample transcript line to verify the pipeline is working as expected.">
        <form onSubmit={handleSubmit}>
          <YStack gap="$4">
            <FormField label="Speaker Name">
              <Input
                type="text"
                value={speaker}
                onChange={(e: any) => setSpeaker(e.target.value)}
                placeholder="Test User"
                disabled={isSending}
              />
            </FormField>

            <FormField label="Transcript Text" required>
              <Textarea
                value={text}
                onChange={(e: any) => setText(e.target.value)}
                placeholder="Enter test transcript text here..."
                disabled={isSending}
                rows={6}
                minHeight={120}
              />
            </FormField>

            {error && <Alert variant="error">{error}</Alert>}

            <ButtonGroup>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSending || !text.trim()}>
                {isSending ? 'Sending…' : 'Send Transcript'}
              </Button>
            </ButtonGroup>
          </YStack>
        </form>
      </ModalContent>
    </Modal>
  );
}
