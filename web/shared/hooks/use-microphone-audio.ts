import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

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

/**
 * Hook for capturing microphone audio and streaming to transcript agent
 * 
 * @param eventId - Event ID to stream audio to
 * @param options - Configuration options
 * @returns Microphone audio state and control functions
 */
export function useMicrophoneAudio(
  eventId: string | null,
  options: MicrophoneAudioOptions = {}
): MicrophoneAudioState {
  const pathname = usePathname();
  const recordingPathnameRef = useRef<string | null>(null);

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

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const seqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  
  // Keep refs in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);
  
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const handleError = useCallback(
    (err: Error) => {
      setError(err);
      onError?.(err);
      console.error('[use-microphone-audio] Error:', err);
    },
    [onError]
  );

  const eventIdRef = useRef<string | null>(eventId);
  
  // Update ref when eventId changes, but don't stop recording if it was already started
  useEffect(() => {
    eventIdRef.current = eventId;
  }, [eventId]);

  const sendAudioChunk = useCallback(
    async (audioBase64: string, isFinal: boolean) => {
      const currentEventId = eventIdRef.current;
      if (!currentEventId) {
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
        const response = await fetch(`/api/agent-sessions/${currentEventId}/transcript-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          // Log error but don't stop recording - allow it to continue
          console.warn('[use-microphone-audio] Failed to send audio chunk:', data.error || `HTTP ${response.status}`);
          return;
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was aborted, ignore
          return;
        }
        // Log error but don't stop recording - allow it to continue
        console.warn('[use-microphone-audio] Error sending audio chunk:', err);
      }
    },
    [sampleRate, encoding, chunkDurationMs, speaker]
  );

  const processAudioChunk = useCallback(
    (audioBuffer: Float32Array) => {
      if (isPaused || !isRecording) {
        return;
      }

      // Convert Float32Array to Int16Array (PCM 16-bit)
      const int16Buffer = new Int16Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        // Clamp to [-1, 1] and convert to 16-bit integer
        const sample = Math.max(-1, Math.min(1, audioBuffer[i]));
        int16Buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      // Convert to base64 (handle large buffers efficiently)
      const uint8Array = new Uint8Array(int16Buffer.buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);

      void sendAudioChunk(base64, false);
    },
    [isPaused, isRecording, sendAudioChunk]
  );

  const startRecording = useCallback(async () => {
    if (isRecording) {
      return;
    }

    const currentEventId = eventIdRef.current;
    if (!currentEventId) {
      handleError(new Error('Event ID is required to start recording'));
      return;
    }

    try {
      setError(null);
      abortControllerRef.current = new AbortController();

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;

      // Handle stream ending unexpectedly
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          console.warn('[use-microphone-audio] Media stream track ended unexpectedly');
          // Don't auto-stop, let user control it
        };
      });

      // Create AudioContext for processing
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate,
      });
      audioContextRef.current = audioContext;

      // Handle audio context state changes
      audioContext.onstatechange = () => {
        if (audioContext.state === 'closed') {
          console.warn('[use-microphone-audio] AudioContext closed unexpectedly');
        } else if (audioContext.state === 'suspended') {
          console.warn('[use-microphone-audio] AudioContext suspended, attempting to resume');
          void audioContext.resume();
        }
      };

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      // Create ScriptProcessorNode for chunk processing
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // For production, consider using AudioWorkletNode (requires separate worklet file)
      const bufferSize = Math.max(4096, Math.floor((sampleRate * chunkDurationMs) / 1000));
      const processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorNodeRef.current = processorNode;

      processorNode.onaudioprocess = (event) => {
        // Check if we're still recording before processing (use refs to avoid stale closures)
        if (!isRecordingRef.current || isPausedRef.current) {
          return;
        }
        const inputBuffer = event.inputBuffer.getChannelData(0);
        processAudioChunk(inputBuffer);
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);

      // Ensure audio context is running
      if (audioContext.state === 'suspended') {
        void audioContext.resume();
      }

      setIsRecording(true);
      setIsPaused(false);
      seqRef.current = 0;
      recordingPathnameRef.current = pathname;
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Failed to start microphone'));
    }
  }, [isRecording, sampleRate, chunkDurationMs, processAudioChunk, handleError]);

  const stopRecording = useCallback(() => {
    if (!isRecording) {
      return;
    }

    // Send final chunk if we have an eventId
    const currentEventId = eventIdRef.current;
    if (currentEventId) {
      void sendAudioChunk('', true);
    }

    // Cleanup
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
  }, [isRecording, sendAudioChunk]);

  const pauseRecording = useCallback(() => {
    if (isRecording && !isPaused && processorNodeRef.current && audioContextRef.current) {
      // Disconnect processor to stop processing audio
      processorNodeRef.current.disconnect();
      setIsPaused(true);
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (isRecording && isPaused && processorNodeRef.current && sourceNodeRef.current && audioContextRef.current) {
      // Reconnect processor to resume processing
      sourceNodeRef.current.connect(processorNodeRef.current);
      processorNodeRef.current.connect(audioContextRef.current.destination);
      setIsPaused(false);
    }
  }, [isRecording, isPaused]);

  // Cleanup on unmount - but only if we're actually leaving the event page
  // This prevents stopping when just switching tabs in the same route
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Stop recording when page is actually unloading
      if (isRecordingRef.current) {
        stopRecording();
      }
    };

    const handleVisibilityChange = () => {
      // Don't stop on visibility change - allow recording to continue in background
      // Only stop if page is actually unloading
    };

      // Only stop on actual page unload, not on component unmount or tab switch
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Only stop recording on unmount if we're leaving the event page entirely
      // Since tabs stay on the same route, we only stop if pathname changed away from events
      const recordingPath = recordingPathnameRef.current;
      const stillOnEventPage = pathname && pathname.includes('/events/');
      
      if (isRecordingRef.current && !stillOnEventPage) {
        // We're leaving the event pages entirely, stop recording
        stopRecording();
      }
      // Otherwise, let recording continue - user is just switching tabs within same page
      // Component unmount from tab switching won't stop recording
    };
  }, [stopRecording, pathname]);

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

