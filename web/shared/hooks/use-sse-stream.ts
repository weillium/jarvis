'use client';

import { useEffect, useRef, useState } from 'react';
import type { SSEMessage } from '@/shared/types/card';

export interface UseSSEStreamOptions {
  eventId: string;
  onMessage?: (message: SSEMessage) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
}

export interface UseSSEStreamReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  reconnect: () => void;
}

/**
 * Hook for connecting to SSE stream and receiving live updates
 */
export function useSSEStream(options: UseSSEStreamOptions): UseSSEStreamReturn {
  const { eventId, onMessage, onError, onConnect, onDisconnect, reconnectInterval = 3000 } = options;
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (!eventId) return;
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsConnecting(true);
    setError(null);

    try {
      const eventSource = new EventSource(`/api/stream?event_id=${eventId}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        onConnect?.();
      };

      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);
          
          // Handle heartbeat silently
          if (message.type === 'heartbeat') {
            return;
          }

          // Handle connected message
          if (message.type === 'connected') {
            setIsConnected(true);
            setIsConnecting(false);
            onConnect?.();
            return;
          }

          // Pass other messages to handler
          onMessage?.(message);
        } catch (err) {
          console.error('[SSE] Error parsing message:', err);
        }
      };

      eventSource.onerror = (err) => {
        setIsConnecting(false);
        
        // Check if connection is closed
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsConnected(false);
          onDisconnect?.();
          
          // Attempt to reconnect
          if (reconnectInterval > 0) {
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, reconnectInterval);
          }
        } else {
          const error = new Error('SSE connection error');
          setError(error);
          onError?.(error);
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create SSE connection');
      setError(error);
      setIsConnecting(false);
      onError?.(error);
    }
  };

  const reconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    connect();
  };

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [eventId]);

  return {
    isConnected,
    isConnecting,
    error,
    reconnect,
  };
}

