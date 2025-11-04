'use client';

import { useEffect, useState, useRef } from 'react';

export interface AgentSessionStatus {
  agent_type: 'cards' | 'facts';
  session_id: string;
  status: 'starting' | 'active' | 'paused' | 'closed' | 'error';
  runtime?: {
    event_id: string;
    agent_id: string;
    runtime_status: string;
    cards_last_seq: number;
    facts_last_seq: number;
    facts_last_update: string;
    ring_buffer_stats: any;
    facts_store_stats: any;
  };
  token_metrics?: {
    total_tokens: number;
    request_count: number;
    max_tokens: number;
    avg_tokens: number;
    warnings: number;
    criticals: number;
    last_request?: {
      tokens: number;
      percentage: number;
      breakdown: Record<string, number>;
      timestamp: string;
    };
  };
  recent_logs?: Array<{
    level: 'log' | 'warn' | 'error';
    message: string;
    timestamp: string;
    context?: {
      seq?: number;
      agent_type?: 'cards' | 'facts';
      event_id?: string;
    };
  }>;
  metadata: {
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    model?: string;
  };
}

export interface UseAgentSessionsReturn {
  cards: AgentSessionStatus | null;
  facts: AgentSessionStatus | null;
  isLoading: boolean;
  error: Error | null;
  reconnect: () => void;
}

/**
 * Hook for managing agent session status via SSE stream
 * Connects to /api/stream and parses agent_session_status events
 */
export function useAgentSessions(
  eventId: string | null
): UseAgentSessionsReturn {
  const [cards, setCards] = useState<AgentSessionStatus | null>(null);
  const [facts, setFacts] = useState<AgentSessionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (!eventId) {
      setIsLoading(false);
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsLoading(true);
    setError(null);

    try {
      const eventSource = new EventSource(`/api/stream?event_id=${eventId}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsLoading(false);
      };

      eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle heartbeat silently
          if (message.type === 'heartbeat') {
            return;
          }

          // Handle connected message
          if (message.type === 'connected') {
            setIsLoading(false);
            return;
          }

          // Handle agent_session_status messages
          if (message.type === 'agent_session_status') {
            const status = message.payload as AgentSessionStatus;
            console.log('[useAgentSessions] Received status:', status.agent_type, status.status);
            
            if (status.agent_type === 'cards') {
              setCards(status);
            } else if (status.agent_type === 'facts') {
              setFacts(status);
            }
          }
        } catch (err) {
          console.error('[useAgentSessions] Error parsing message:', err);
        }
      };

      eventSource.onerror = (err) => {
        setIsLoading(false);
        
        // Check if connection is closed
        if (eventSource.readyState === EventSource.CLOSED) {
          setError(new Error('SSE connection closed'));
          
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        } else {
          setError(new Error('SSE connection error'));
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create SSE connection');
      setError(error);
      setIsLoading(false);
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
    cards,
    facts,
    isLoading,
    error,
    reconnect,
  };
}

