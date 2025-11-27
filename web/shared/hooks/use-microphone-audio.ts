import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export interface MicrophoneAudioOptions {
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

const DEFAULT_CHUNK_DURATION_MS = 200; // 200ms chunks for WebM/Opus

// Get WebSocket URL for connecting to worker audio stream
// In production, set NEXT_PUBLIC_WORKER_WS_URL environment variable
const getWebSocketUrl = (): string => {
  // Use environment variable if set (for production)
  const envWsUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WORKER_WS_URL : undefined;
  
  if (envWsUrl) {
    // Ensure it has the correct protocol
    if (envWsUrl.startsWith('ws://') || envWsUrl.startsWith('wss://')) {
      return `${envWsUrl}/audio/stream`;
    }
    // If it's http/https, convert to ws/wss
    if (envWsUrl.startsWith('http://')) {
      return envWsUrl.replace('http://', 'ws://') + '/audio/stream';
    }
    if (envWsUrl.startsWith('https://')) {
      return envWsUrl.replace('https://', 'wss://') + '/audio/stream';
    }
    // Assume it's just a host, add protocol
    return `ws://${envWsUrl}/audio/stream`;
  }
  
  // Development default: connect directly to worker on localhost:3001
  // Match the protocol of the current page (ws for http, wss for https)
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//localhost:3001/audio/stream`;
  }
  
  // Fallback (shouldn't happen in browser)
  return 'ws://localhost:3001/audio/stream';
};

/**
 * Hook for capturing microphone audio and streaming to transcript agent via WebSocket
 * 
 * Uses MediaRecorder API with WebM/Opus codec for efficient streaming.
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
    chunkDurationMs = DEFAULT_CHUNK_DURATION_MS,
    speaker,
    onError,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
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

  // Check if recording is actually still active on mount (handles remounts and tab switches)
  useEffect(() => {
    // Sync state from MediaRecorder and WebSocket refs
    const syncStateFromRefs = () => {
      const recorderState = mediaRecorderRef.current?.state;
      const wsState = wsRef.current?.readyState;
      
      // If MediaRecorder is recording/paused, we should be recording
      if (recorderState === 'recording' || recorderState === 'paused') {
        if (!isRecording) {
          setIsRecording(true);
          setIsPaused(recorderState === 'paused');
          isRecordingRef.current = true;
          isPausedRef.current = recorderState === 'paused';
          console.log('[use-microphone-audio] Restored recording state from MediaRecorder:', { recording: true, paused: recorderState === 'paused' });
        }
      } else if (recorderState === 'inactive' && isRecording) {
        // MediaRecorder stopped but state says recording - sync down
        setIsRecording(false);
        setIsPaused(false);
        isRecordingRef.current = false;
        isPausedRef.current = false;
        console.log('[use-microphone-audio] Synced state: MediaRecorder inactive');
      }
      
      // If WebSocket is closed but we think we're recording, check MediaRecorder
      if (wsState === WebSocket.CLOSED && isRecording && recorderState === 'inactive') {
        setIsRecording(false);
        setIsPaused(false);
        isRecordingRef.current = false;
        isPausedRef.current = false;
        console.log('[use-microphone-audio] Synced state: WebSocket closed and MediaRecorder inactive');
      }
    };
    
    // Sync immediately on mount
    syncStateFromRefs();
    
    // Also sync periodically to catch state changes (e.g., from tab switches)
    const syncInterval = setInterval(syncStateFromRefs, 1000);
    
    return () => {
      clearInterval(syncInterval);
    };
  }, [isRecording]); // Re-run when isRecording changes

  // Handle page visibility changes - don't stop recording when tabbing out
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - keep recording but don't change state
        console.log('[use-microphone-audio] Page hidden, recording continues');
      } else {
        // Tab is visible again - sync state from MediaRecorder
        // This ensures the button shows the correct state after tab switch
        const recorderState = mediaRecorderRef.current?.state;
        const wsState = wsRef.current?.readyState;
        
        if (recorderState === 'recording' || recorderState === 'paused') {
          // Recording is still active, ensure state is synced
          if (!isRecording) {
            setIsRecording(true);
            setIsPaused(recorderState === 'paused');
            isRecordingRef.current = true;
            isPausedRef.current = recorderState === 'paused';
            console.log('[use-microphone-audio] Page visible, restored recording state:', recorderState);
          } else if (isPaused !== (recorderState === 'paused')) {
            // State mismatch - sync paused state
            setIsPaused(recorderState === 'paused');
            isPausedRef.current = recorderState === 'paused';
            console.log('[use-microphone-audio] Page visible, synced paused state:', recorderState === 'paused');
          }
        } else if (recorderState === 'inactive') {
          // Recording stopped while tab was hidden
          if (isRecording) {
            setIsRecording(false);
            setIsPaused(false);
            isRecordingRef.current = false;
            isPausedRef.current = false;
            console.log('[use-microphone-audio] Page visible, recording was stopped');
          }
        }
        
        // Also check WebSocket state
        if (wsState === WebSocket.CLOSED && recorderState === 'inactive' && isRecording) {
          setIsRecording(false);
          setIsPaused(false);
          isRecordingRef.current = false;
          isPausedRef.current = false;
          console.log('[use-microphone-audio] Page visible, WebSocket closed and recording inactive');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRecording, isPaused]); // Include dependencies to ensure handler has latest state

  const handleError = useCallback(
    (err: Error) => {
      setError(err);
      onError?.(err);
      console.error('[use-microphone-audio] Error:', err);
    },
    [onError]
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

      // Check if there's an existing WebSocket connection
      const existingWs = wsRef.current;
      if (existingWs) {
        const state = existingWs.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          console.log('[use-microphone-audio] Reusing existing WebSocket connection');
          // Connection exists and is valid, we can use it
        } else {
          // Connection is closed or closing, clean it up
          console.log('[use-microphone-audio] Existing WebSocket is closed, cleaning up');
          try {
            existingWs.close();
          } catch {
            // Ignore errors when closing
          }
          wsRef.current = null;
        }
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Let browser choose optimal sample rate
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

      // Check if WebM with Opus is supported
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        // Fallback to default WebM
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          // Last resort: use default
          mimeType = '';
        }
        console.warn(`[use-microphone-audio] WebM/Opus not supported, using ${mimeType || 'default format'}`);
      }

      // Create MediaRecorder with WebM/Opus
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000, // 128 kbps
      });

      mediaRecorderRef.current = mediaRecorder;

      // Connect to WebSocket (check if we already have an open connection)
      let ws = wsRef.current;
      const isConnectionAlreadyOpen = ws && ws.readyState === WebSocket.OPEN;
      
      // Set up session start handler (will be attached immediately after WebSocket creation)
      let sessionStartHandler: ((event: MessageEvent) => void) | null = null;
      let handlerResolved = false;
      let startMessageSent = false;
      
      const createSessionStartHandler = (
        resolve: () => void,
        reject: (error: Error) => void,
        timeout: ReturnType<typeof setTimeout>
      ): ((event: MessageEvent) => void) => {
        return (event: MessageEvent) => {
          if (handlerResolved) {
            return;
          }
          
          try {
            let messageData: string;
            if (typeof event.data === 'string') {
              messageData = event.data;
            } else if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
              return; // Binary data - not our message
            } else {
              messageData = String(event.data);
            }
            
            const message = JSON.parse(messageData);
            console.log('[use-microphone-audio] Received message while waiting for session start:', message);
            
            if (message.ok && message.message === 'Session started') {
              handlerResolved = true;
              clearTimeout(timeout);
              console.log('[use-microphone-audio] ✓ Session confirmed by server:', message);
              if (sessionStartHandler && ws) {
                ws.removeEventListener('message', sessionStartHandler);
              }
              resolve();
              return;
            } else if (!message.ok) {
              handlerResolved = true;
              clearTimeout(timeout);
              const errorMsg = message.error || 'Server error';
              console.warn('[use-microphone-audio] ✗ Server error:', errorMsg, message);
              if (sessionStartHandler && ws) {
                ws.removeEventListener('message', sessionStartHandler);
              }
              reject(new Error(errorMsg));
              return;
            } else if (message.ok && message.message === 'Connected to audio stream') {
              // Welcome message received
              console.log('[use-microphone-audio] Received welcome message from server');
              
              // Send start message if not already sent
              if (!startMessageSent && ws && ws.readyState === WebSocket.OPEN) {
                startMessageSent = true;
                const startMessage = {
                  type: 'start' as const,
                  client: 'web',
                  codec: 'webm-opus',
                  event_id: currentEventId,
                  ...(speaker ? { speaker } : {}),
                };
                const startMessageJson = JSON.stringify(startMessage);
                ws.send(startMessageJson);
                console.log('[use-microphone-audio] Sent start message as TEXT frame (after welcome):', startMessage);
              }
            } else if (message.ok) {
              console.log('[use-microphone-audio] Server response (waiting for session start):', message);
            }
          } catch (err) {
            // Not JSON - ignore
          }
        };
      };
      
      if (!isConnectionAlreadyOpen) {
        // Need to create a new connection or wait for existing one
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          // Create new connection
          const wsUrl = getWebSocketUrl();
          console.log(`[use-microphone-audio] Creating new WebSocket connection: ${wsUrl}`);
          
          ws = new WebSocket(wsUrl);
          wsRef.current = ws;
          
          // CRITICAL: Set up session start handler BEFORE connection opens
          // This ensures we receive the welcome message that arrives immediately when connection opens
          const sessionStartPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.error('[use-microphone-audio] Session start timeout - no confirmation received');
              if (sessionStartHandler && ws) {
                ws.removeEventListener('message', sessionStartHandler);
              }
              reject(new Error('Session start timeout - server did not confirm session started'));
            }, 5000);
            
            sessionStartHandler = createSessionStartHandler(resolve, reject, timeout);
            
            // Attach handler IMMEDIATELY after creating WebSocket (before connection opens)
            // This ensures we catch the welcome message
            if (ws) {
              ws.addEventListener('message', sessionStartHandler);
              console.log('[use-microphone-audio] Session start message handler attached immediately after WebSocket creation');
              
              // Fallback: Send start message after connection opens (in case welcome is missed)
              const sendStartAfterOpen = () => {
                const currentWs = wsRef.current;
                if (!startMessageSent && currentWs && currentWs.readyState === WebSocket.OPEN) {
                  startMessageSent = true;
                  const startMessage = {
                    type: 'start' as const,
                    client: 'web',
                    codec: 'webm-opus',
                    event_id: currentEventId,
                    ...(speaker ? { speaker } : {}),
                  };
                  const startMessageJson = JSON.stringify(startMessage);
                  currentWs.send(startMessageJson);
                  console.log('[use-microphone-audio] Sent start message (fallback after connection open):', startMessage);
                }
              };
              
              // Wait for connection to open, then send start message if not already sent
              ws.addEventListener('open', () => {
                console.log('[use-microphone-audio] WebSocket connected (OPEN event fired)');
                setTimeout(sendStartAfterOpen, 50) as ReturnType<typeof setTimeout>;
              });
            }
          });
          
          // Wait for WebSocket to open
          await new Promise<void>((resolve, reject) => {
            const currentWs = wsRef.current;
            if (!currentWs) {
              reject(new Error('WebSocket is null'));
              return;
            }
            
            const timeout = setTimeout(() => {
              reject(new Error('WebSocket connection timeout'));
            }, 5000) as ReturnType<typeof setTimeout>;

            const onOpen = () => {
              clearTimeout(timeout);
              const wsInstance = wsRef.current;
              wsInstance?.removeEventListener('open', onOpen);
              wsInstance?.removeEventListener('error', onError);
              resolve();
            };

            const onError = (err: Event) => {
              clearTimeout(timeout);
              console.error('[use-microphone-audio] WebSocket error during connection:', err);
              const wsInstance = wsRef.current;
              wsInstance?.removeEventListener('open', onOpen);
              wsInstance?.removeEventListener('error', onError);
              reject(new Error('Failed to connect to audio stream server'));
            };

            if (currentWs.readyState === WebSocket.OPEN) {
              clearTimeout(timeout);
              resolve();
            } else {
              currentWs.addEventListener('open', onOpen);
              currentWs.addEventListener('error', onError);
            }
          });
          
          // Wait for session start confirmation
          await sessionStartPromise;
          
          ws = wsRef.current;
        } else if (ws && ws.readyState === WebSocket.CONNECTING) {
          console.log('[use-microphone-audio] WebSocket is already connecting, waiting...');
          // Wait for it to open
          await new Promise<void>((resolve, reject) => {
            const currentWs = wsRef.current;
            if (!currentWs) {
              reject(new Error('WebSocket is null'));
              return;
            }
            
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000) as ReturnType<typeof setTimeout>;
            currentWs.addEventListener('open', () => {
              clearTimeout(timeout);
              resolve();
            });
            currentWs.addEventListener('error', () => {
              clearTimeout(timeout);
              reject(new Error('Connection error'));
            });
          });
        }
      } else {
        console.log('[use-microphone-audio] Using existing open WebSocket connection');
      }

      // Now ensure we have a valid open connection
      if (!ws) {
        throw new Error('WebSocket is null');
      }
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket connection is not open (state: ${ws.readyState})`);
      }

      // Set up ongoing message handler for future messages (session is already started)
      // Note: The session confirmation handler above will be removed after confirmation
      // This handler is for ongoing messages after session is established
      const ongoingMessageHandler = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          if (message.ok) {
            console.log('[use-microphone-audio] Server response:', message);
          } else {
            console.warn('[use-microphone-audio] Server error:', message.error);
            handleError(new Error(message.error || 'Server error'));
          }
        } catch {
          // Ignore non-JSON messages (these are binary audio chunks)
        }
      };
      
      ws.addEventListener('message', ongoingMessageHandler);

      const currentWs = wsRef.current;
      if (currentWs) {
        currentWs.onclose = () => {
          console.log('[use-microphone-audio] WebSocket closed');
          if (isRecordingRef.current) {
            handleError(new Error('WebSocket connection closed unexpectedly'));
            setIsRecording(false);
            isRecordingRef.current = false;
          }
        };

        currentWs.onerror = (err) => {
          console.error('[use-microphone-audio] WebSocket error:', err);
          handleError(new Error('WebSocket connection error'));
        };
      }

      // Handle audio data from MediaRecorder
      // NOTE: MediaRecorder won't start until after the promise resolves,
      // which only happens after we receive "Session started" confirmation
      mediaRecorder.ondataavailable = async (event) => {
        if (!isRecordingRef.current || isPausedRef.current) {
          return;
        }

        const currentWs = wsRef.current;
        if (event.data.size > 0 && currentWs && currentWs.readyState === WebSocket.OPEN) {
          // Convert Blob to ArrayBuffer and send as binary
          const arrayBuffer = await event.data.arrayBuffer();
          currentWs.send(arrayBuffer);
          console.log(`[use-microphone-audio] Sent audio chunk: ${arrayBuffer.byteLength} bytes`);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('[use-microphone-audio] MediaRecorder error:', event);
        handleError(new Error('MediaRecorder error'));
      };

      // IMPORTANT: Only start MediaRecorder AFTER session is confirmed
      // The promise above resolves only after we get "Session started" confirmation
      // So MediaRecorder won't start until the server is ready to receive audio
      
      // Start recording with timeslice for chunking
      mediaRecorder.start(chunkDurationMs);
      console.log(`[use-microphone-audio] Started MediaRecorder with ${chunkDurationMs}ms timeslice (session confirmed by server)`);

      setIsRecording(true);
      setIsPaused(false);
      isRecordingRef.current = true;
      isPausedRef.current = false;
      recordingPathnameRef.current = pathname;
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('Failed to start microphone'));
      // Cleanup on error
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }
  }, [isRecording, chunkDurationMs, speaker, handleError, pathname]);

  const stopRecording = useCallback(() => {
    if (!isRecording) {
      return;
    }

    const ws = wsRef.current;
    const mediaRecorder = mediaRecorderRef.current;

    // Stop MediaRecorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    // Send stop message and close WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      const stopMessage = { type: 'stop' as const };
      ws.send(JSON.stringify(stopMessage));
      console.log('[use-microphone-audio] Sent stop message');
      
      // Close WebSocket after a brief delay to allow stop message to be processed
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }, 100);
    }

    // Cleanup media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    mediaRecorderRef.current = null;
    wsRef.current = null;

    setIsRecording(false);
    setIsPaused(false);
    isRecordingRef.current = false;
    isPausedRef.current = false;
  }, [isRecording]);

  const pauseRecording = useCallback(() => {
    if (isRecording && !isPaused && mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        isPausedRef.current = true;
        console.log('[use-microphone-audio] Recording paused');
      }
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (isRecording && isPaused && mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        isPausedRef.current = false;
        console.log('[use-microphone-audio] Recording resumed');
      }
    }
  }, [isRecording, isPaused]);

  // Cleanup on unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isRecordingRef.current) {
        stopRecording();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Stop recording on unmount if leaving event page
      const recordingPath = recordingPathnameRef.current;
      const stillOnEventPage = pathname && pathname.includes('/events/');
      
      if (isRecordingRef.current && !stillOnEventPage) {
        stopRecording();
      }
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
