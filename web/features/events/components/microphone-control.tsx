'use client';

import { Button } from '@jarvis/ui-core';
import { XStack, YStack, Text } from '@jarvis/ui-core';
import { useMicrophoneAudio } from '@/shared/hooks/use-microphone-audio';

export interface MicrophoneControlProps {
  eventId: string | null;
  speaker?: string;
  onError?: (error: Error) => void;
  disabled?: boolean;
}

/**
 * Microphone control component for starting/stopping audio collection
 * Streams audio to the transcript agent via worker
 */
export function MicrophoneControl({
  eventId,
  speaker,
  onError,
  disabled = false,
}: MicrophoneControlProps) {
  const {
    isRecording,
    isPaused,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  } = useMicrophoneAudio(eventId, {
    speaker,
    onError,
  });

  const handleToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  if (error) {
    return (
      <YStack gap="$2">
        <Text color="$red11" fontSize="$3">
          Microphone error: {error.message}
        </Text>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (isRecording) {
              stopRecording();
            }
          }}
        >
          Reset
        </Button>
      </YStack>
    );
  }

  return (
    <XStack gap="$3" alignItems="center">
      <Button
        variant={isRecording ? 'primary' : 'secondary'}
        size="md"
        onClick={handleToggle}
        disabled={disabled || !eventId}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </Button>

      {isRecording && (
        <Button
          variant="outline"
          size="sm"
          onClick={handlePauseResume}
          disabled={disabled}
        >
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
      )}

      {isRecording && (
        <XStack alignItems="center" gap="$2">
          <XStack
            width={8}
            height={8}
            borderRadius="$10"
            backgroundColor={isPaused ? '$yellow9' : '$green9'}
            animation="quick"
          />
          <Text fontSize="$2" color="$gray11">
            {isPaused ? 'Paused' : 'Recording...'}
          </Text>
        </XStack>
      )}
    </XStack>
  );
}

