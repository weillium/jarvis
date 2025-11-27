import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';

export interface MicrophoneAudioOptions {
  sampleRate?: number;
  chunkDurationMs?: number;
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

const DEFAULT_SAMPLE_RATE = 16000; // 16kHz for PCM16
const DEFAULT_CHUNK_DURATION_MS = 100; // 100ms chunks

// Get WebSocket URL for connecting to worker audio stream
const getWebSocketUrl = (): string => {
  // Try expo config first
  if (Constants.expoConfig?.extra?.workerWsUrl) {
    const url = Constants.expoConfig.extra.workerWsUrl as string;
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return `${url}/audio/stream`;
    }
    return `ws://${url}/audio/stream`;
  }

  // Try environment variable
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WORKER_WS_URL) {
    const url = process.env.EXPO_PUBLIC_WORKER_WS_URL;
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return `${url}/audio/stream`;
    }
    if (url.startsWith('http://')) {
      return url.replace('http://', 'ws://') + '/audio/stream';
    }
    if (url.startsWith('https://')) {
      return url.replace('https://', 'wss://') + '/audio/stream';
    }
    return `ws://${url}/audio/stream`;
  }

  // Development default: connect to localhost worker
  // For physical devices, replace localhost with your machine's IP
  return 'ws://localhost:3001/audio/stream';
};

/**
 * Hook for capturing microphone audio and streaming to transcript agent via WebSocket (Mobile/React Native)
 * 
 * Uses expo-av to record audio and streams binary chunks via WebSocket.
 * Attempts to use linear PCM format when possible for optimal quality.
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
    speaker,
    onError,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastChunkSizeRef = useRef(0);
  const isPausedRef = useRef(false);
  const isRecordingRef = useRef(false);
  const eventIdRef = useRef<string | null>(eventId);

  // Keep refs in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    eventIdRef.current = eventId;
  }, [eventId]);

  const handleError = useCallback(
    (err: Error) => {
      setError(err);
      onError?.(err);
      console.error('[use-microphone-audio] Error:', err);
    },
    [onError]
  );

  const readAndSendAudioChunk = useCallback(
    async (uri: string): Promise<void> => {
      if (!isRecordingRef.current || isPausedRef.current || !wsRef.current) {
        return;
      }

      const ws = wsRef.current;
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        // Read the audio file
        const response = await fetch(uri);

        if (!response.ok) {
          // File might be locked during recording - this is expected
          if (response.status === 403 || response.status === 404) {
            return;
          }
          throw new Error(`Failed to read audio file: HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Only process new data (after lastChunkSizeRef)
        if (uint8Array.length <= lastChunkSizeRef.current) {
          return; // No new data
        }

        const newData = uint8Array.subarray(lastChunkSizeRef.current);
        lastChunkSizeRef.current = uint8Array.length;

        // Send binary chunk directly via WebSocket
        ws.send(newData);
        console.log(`[use-microphone-audio] Sent audio chunk: ${newData.length} bytes`);
      } catch (err) {
        // Silently handle errors during active recording (file may be locked)
        if (
          err instanceof Error &&
          (err.message.includes('locked') ||
            err.message.includes('403') ||
            err.message.includes('404'))
        ) {
          return;
        }
        console.warn(
          '[use-microphone-audio] Error reading/sending audio data:',
          err instanceof Error ? err.message : String(err)
        );
      }
    },
    []
  );

  const startRecording = useCallback(async () => {
    if (isRecording || !eventId) {
      return;
    }

    const currentEventId = eventIdRef.current;
    if (!currentEventId) {
      handleError(new Error('Event ID is required to start recording'));
      return;
    }

    try {
      setError(null);

      // Request audio permissions
      const permissionResult = await Audio.requestPermissionsAsync();
      if (!permissionResult.granted) {
        throw new Error('Microphone permission not granted');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Connect to WebSocket first
      const wsUrl = getWebSocketUrl();
      console.log(`[use-microphone-audio] Connecting to WebSocket: ${wsUrl}`);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Wait for WebSocket to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log('[use-microphone-audio] WebSocket connected');

          // Send start message
          const startMessage = {
            type: 'start' as const,
            client: 'mobile',
            codec: 'pcm16',
            event_id: currentEventId,
            sample_rate: sampleRate,
            bytes_per_sample: 2,
            ...(speaker ? { speaker } : {}),
          };

          ws.send(JSON.stringify(startMessage));
          console.log('[use-microphone-audio] Sent start message:', startMessage);
          resolve();
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          console.error('[use-microphone-audio] WebSocket error:', err);
          reject(new Error('Failed to connect to audio stream server'));
        };
      });

      // Handle WebSocket messages (server responses)
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string);
          if (message.ok) {
            console.log('[use-microphone-audio] Server response:', message);
          } else {
            console.warn('[use-microphone-audio] Server error:', message.error);
            handleError(new Error(message.error || 'Server error'));
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        console.log('[use-microphone-audio] WebSocket closed');
        if (isRecordingRef.current) {
          handleError(new Error('WebSocket connection closed unexpectedly'));
          setIsRecording(false);
          isRecordingRef.current = false;
        }
      };

      ws.onerror = (err) => {
        console.error('[use-microphone-audio] WebSocket error:', err);
        handleError(new Error('WebSocket connection error'));
      };

      // Create recording with options optimized for PCM-like format
      // Note: expo-av on iOS supports linear PCM, Android uses compressed formats
      const recordingOptions: Audio.RecordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: sampleRate,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          // Try to use linear PCM for better compatibility with PCM16
          extension: '.caf',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: sampleRate,
          numberOfChannels: 1,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };

      const { recording } = await Audio.Recording.createAsync(
        recordingOptions,
        (status) => {
          // Status callback - called periodically during recording
          if (status.isRecording && status.uri && !isPausedRef.current) {
            void readAndSendAudioChunk(status.uri);
          }
        },
        chunkDurationMs
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setIsPaused(false);
      isRecordingRef.current = true;
      isPausedRef.current = false;
      lastChunkSizeRef.current = 0;

      // Set up periodic chunk reading to ensure we capture all audio
      intervalRef.current = setInterval(async () => {
        if (!isRecordingRef.current || isPausedRef.current || !recordingRef.current) {
          return;
        }

        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording && status.uri) {
            await readAndSendAudioChunk(status.uri);
          }
        } catch (err) {
          console.warn('[use-microphone-audio] Error in periodic chunk reading:', err);
        }
      }, Math.max(chunkDurationMs, 100)); // Minimum 100ms interval
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Failed to start microphone'));

      // Cleanup on error
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {
          // Ignore cleanup errors
        }
        recordingRef.current = null;
      }
    }
  }, [isRecording, eventId, sampleRate, chunkDurationMs, speaker, readAndSendAudioChunk, handleError]);

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

      // Send any remaining audio data before stopping
      if (recordingRef.current) {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording && status.uri) {
          await readAndSendAudioChunk(status.uri);
        }
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }

      // Send stop message and close WebSocket
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const stopMessage = { type: 'stop' as const };
        ws.send(JSON.stringify(stopMessage));
        console.log('[use-microphone-audio] Sent stop message');

        // Close WebSocket after a brief delay
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        }, 100);
      }

      wsRef.current = null;
      lastChunkSizeRef.current = 0;

      setIsRecording(false);
      setIsPaused(false);
      isRecordingRef.current = false;
      isPausedRef.current = false;
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Failed to stop recording'));
    }
  }, [isRecording, readAndSendAudioChunk, handleError]);

  const pauseRecording = useCallback(async () => {
    if (isRecording && !isPaused && recordingRef.current) {
      try {
        await recordingRef.current.pauseAsync();
        setIsPaused(true);
        isPausedRef.current = true;
        console.log('[use-microphone-audio] Recording paused');
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
        isPausedRef.current = false;
        console.log('[use-microphone-audio] Recording resumed');
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
