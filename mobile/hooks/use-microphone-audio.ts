import { useCallback, useEffect, useRef, useState } from 'react';
// Note: Requires expo-av package
// Install with: pnpm add expo-av
import { Audio } from 'expo-av';

export interface MicrophoneAudioOptions {
  sampleRate?: number;
  chunkDurationMs?: number;
  encoding?: string;
  speaker?: string;
  onError?: (error: Error) => void;
}

export interface MicrophoneAudioState {
  isRecording: boolean;
  isPaused: boolean;
  error: Error | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
}

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHUNK_DURATION_MS = 20;
const DEFAULT_ENCODING = 'pcm_s16le';
const BYTES_PER_SAMPLE = 2;

// Worker URL - should match web configuration
const getWorkerUrl = (): string => {
  // In production, this should come from environment variables
  // For now, default to localhost (development) or use a config
  if (typeof process !== 'undefined' && process.env?.WORKER_URL) {
    return process.env.WORKER_URL;
  }
  return 'http://localhost:3001';
};

/**
 * Hook for capturing microphone audio and streaming to transcript agent (Mobile/React Native)
 * 
 * @param eventId - Event ID to stream audio to
 * @param options - Configuration options
 * @returns Microphone audio state and control functions
 */
export function useMicrophoneAudio(
  eventId: string | null,
  options: MicrophoneAudioOptions = {}
): MicrophoneAudioState {
  const {
    sampleRate = DEFAULT_SAMPLE_RATE,
    chunkDurationMs = DEFAULT_CHUNK_DURATION_MS,
    encoding = DEFAULT_ENCODING,
    speaker,
    onError,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const seqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleError = useCallback(
    (err: Error) => {
      setError(err);
      onError?.(err);
      console.error('[use-microphone-audio] Error:', err);
    },
    [onError]
  );

  const sendAudioChunk = useCallback(
    async (audioBase64: string, isFinal: boolean) => {
      if (!eventId) {
        return;
      }

      const seq = seqRef.current;
      seqRef.current += 1;

      const payload = {
        audio_base64: audioBase64,
        seq,
        is_final: isFinal,
        sample_rate: sampleRate,
        bytes_per_sample: BYTES_PER_SAMPLE,
        encoding,
        duration_ms: chunkDurationMs,
        speaker,
      };

      try {
        // For mobile, we need to proxy through web API or directly to worker
        // Assuming web API is available at the same domain
        const apiUrl = `/api/agent-sessions/${eventId}/transcript-audio`;
        // In a real app, you'd construct the full URL based on your API base URL
        const fullUrl = typeof window !== 'undefined' 
          ? `${window.location.origin}${apiUrl}`
          : apiUrl;

        const response = await fetch(fullUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was aborted, ignore
          return;
        }
        handleError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [eventId, sampleRate, encoding, chunkDurationMs, speaker, handleError]
  );

  const processAudioChunk = useCallback(
    async (uri: string) => {
      if (isPaused || !isRecording) {
        return;
      }

      try {
        // Read audio file and convert to base64
        // Note: In production, you might want to use a more efficient streaming approach
        const response = await fetch(uri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to base64
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);

        await sendAudioChunk(base64, false);
      } catch (err) {
        handleError(err instanceof Error ? err : new Error('Failed to process audio chunk'));
      }
    },
    [isPaused, isRecording, sendAudioChunk, handleError]
  );

  const startRecording = useCallback(async () => {
    if (isRecording || !eventId) {
      return;
    }

    try {
      setError(null);
      abortControllerRef.current = new AbortController();

      // Request audio permissions
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          // Handle recording status updates
          if (status.isRecording && status.durationMillis) {
            // Periodically send chunks
            // Note: This is a simplified approach. In production, you might want
            // to use onRecordingStatusUpdate to get more frequent updates
          }
        },
        chunkDurationMs
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setIsPaused(false);
      seqRef.current = 0;

      // Set up periodic chunk sending
      // Note: expo-av doesn't provide direct access to raw audio buffers
      // This is a simplified approach - you may need to adjust based on your needs
      intervalRef.current = setInterval(async () => {
        if (recordingRef.current && !isPaused) {
          try {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording && status.uri) {
              // For real-time streaming, you might need a different approach
              // This is a placeholder - actual implementation depends on expo-av capabilities
            }
          } catch (err) {
            console.error('[use-microphone-audio] Error getting recording status:', err);
          }
        }
      }, chunkDurationMs);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Failed to start microphone'));
    }
  }, [isRecording, eventId, chunkDurationMs, isPaused, handleError]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    try {
      // Clear interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Stop recording
      if (recordingRef.current) {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
          
          // Send final chunk if we have audio data
          if (status.uri) {
            await processAudioChunk(status.uri);
            await sendAudioChunk('', true);
          }
        }
        recordingRef.current = null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      setIsRecording(false);
      setIsPaused(false);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Failed to stop recording'));
    }
  }, [isRecording, processAudioChunk, sendAudioChunk, handleError]);

  const pauseRecording = useCallback(async () => {
    if (isRecording && !isPaused && recordingRef.current) {
      try {
        await recordingRef.current.pauseAsync();
        setIsPaused(true);
      } catch (err) {
        handleError(err instanceof Error ? err : new Error('Failed to pause recording'));
      }
    }
  }, [isRecording, isPaused, handleError]);

  const resumeRecording = useCallback(async () => {
    if (isRecording && isPaused && recordingRef.current) {
      try {
        await recordingRef.current.startAsync();
        setIsPaused(false);
      } catch (err) {
        handleError(err instanceof Error ? err : new Error('Failed to resume recording'));
      }
    }
  }, [isRecording, isPaused, handleError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    isPaused,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}

