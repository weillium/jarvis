'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

export interface AgentSessionStatus {
  agent_type: 'cards' | 'facts';
  session_id: string;
  status: 'generated' | 'starting' | 'active' | 'paused' | 'closed' | 'error';
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

  const connect = useCallback(() => {
    if (!eventId) {
      setIsLoading(false);
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      console.log('[useAgentSessions] Closing existing connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsLoading(true);
    setError(null);

    console.log('[useAgentSessions] Connecting to SSE stream for event:', eventId);

    try {
      const streamUrl = `/api/stream?event_id=${eventId}&_t=${Date.now()}`; // Add timestamp to prevent caching
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[useAgentSessions] SSE connection opened');
        setIsLoading(false);
        setError(null);
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
            setError(null);
            console.log('[useAgentSessions] Connected to SSE stream');
            return;
          }

          // Handle agent_session_status messages
          if (message.type === 'agent_session_status') {
            const status = message.payload as AgentSessionStatus;
            console.log('[useAgentSessions] Received status update:', status.agent_type, status.status, status.session_id);
            
            // Update state - React will automatically re-render components using this hook
            // Always create new object to ensure React detects the change
            if (status.agent_type === 'cards') {
              const updated: AgentSessionStatus = {
                agent_type: 'cards',
                session_id: status.session_id || 'unknown',
                status: status.status,
                metadata: status.metadata || {
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  closed_at: null,
                },
                runtime: status.runtime,
                token_metrics: status.token_metrics,
                recent_logs: status.recent_logs,
              };
              console.log('[useAgentSessions] Setting cards status:', updated.status, updated.session_id);
              setCards(updated);
              setIsLoading(false);
              setError(null);
            } else if (status.agent_type === 'facts') {
              const updated: AgentSessionStatus = {
                agent_type: 'facts',
                session_id: status.session_id || 'unknown',
                status: status.status,
                metadata: status.metadata || {
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  closed_at: null,
                },
                runtime: status.runtime,
                token_metrics: status.token_metrics,
                recent_logs: status.recent_logs,
              };
              console.log('[useAgentSessions] Setting facts status:', updated.status, updated.session_id);
              setFacts(updated);
              setIsLoading(false);
              setError(null);
            }
          }
        } catch (err) {
          console.error('[useAgentSessions] Error parsing message:', err, event.data);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('[useAgentSessions] SSE connection error, readyState:', eventSource.readyState);
        
        // Check if connection is closed
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsLoading(false);
          setError(new Error('SSE connection closed'));
          
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[useAgentSessions] Attempting to reconnect...');
            connect();
          }, 3000);
        } else if (eventSource.readyState === EventSource.CONNECTING) {
          // Still connecting, don't set error yet
          console.log('[useAgentSessions] Still connecting...');
        } else {
          // Connection error but not closed - might recover
          console.warn('[useAgentSessions] Connection error but not closed');
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create SSE connection');
      setError(error);
      setIsLoading(false);
    }
  }, [eventId]);

  const reconnect = useCallback(() => {
    console.log('[useAgentSessions] Manual reconnect triggered');
    
    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Force close existing connection
    if (eventSourceRef.current) {
      console.log('[useAgentSessions] Force closing existing connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Reset state completely
    setCards(null);
    setFacts(null);
    setIsLoading(true);
    setError(null);
    
    // Force a complete reconnection after a brief delay
    setTimeout(() => {
      console.log('[useAgentSessions] Reconnecting...');
      connect();
    }, 200);
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  // Reset state when eventId changes
  useEffect(() => {
    setCards(null);
    setFacts(null);
    setIsLoading(true);
    setError(null);
  }, [eventId]);

  return {
    cards,
    facts,
    isLoading,
    error,
    reconnect,
  };
}

