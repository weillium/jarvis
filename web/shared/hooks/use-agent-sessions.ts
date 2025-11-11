'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { TokenMetrics, RuntimeStats } from './use-agent-sessions-query';

/**
 * SSE Enrichment Data (Real-time connection health only)
 * This is the data streamed via SSE from the worker
 */
export interface AgentSessionSSEEnrichment {
  agent_type: 'transcript' | 'cards' | 'facts';
  websocket_state?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  ping_pong?: {
    enabled: boolean;
    missedPongs: number;
    lastPongReceived?: string;
    pingIntervalMs: number;
    pongTimeoutMs: number;
    maxMissedPongs: number;
  };
  recent_logs?: Array<{
    level: 'log' | 'warn' | 'error';
    message: string;
    timestamp: string;
    context?: Array<{
      key: string;
      value: string | number | boolean | null | undefined;
    }>;
  }>;
  // Real-time metrics (only during active sessions)
  token_metrics?: TokenMetrics;
  runtime_stats?: RuntimeStats;
}

/**
 * Legacy type for backward compatibility
 * @deprecated Use AgentSessionSSEEnrichment for new code
 */
export interface AgentSessionStatus {
  agent_type: 'transcript' | 'cards' | 'facts';
  session_id: string;
  status: 'active' | 'paused' | 'closed' | 'error';
  websocket_state?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
  ping_pong?: AgentSessionSSEEnrichment['ping_pong'];
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
  token_metrics?: TokenMetrics;
  recent_logs?: AgentSessionSSEEnrichment['recent_logs'];
  metadata: {
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    model?: string;
    connection_count: number;
    last_connected_at: string | null;
  };
}

export interface UseAgentSessionEnrichmentReturn {
  enrichment: Map<'transcript' | 'cards' | 'facts', AgentSessionSSEEnrichment>;
  isLoading: boolean;
  error: Error | null;
  reconnect: () => void;
}

/**
 * Legacy return type for backward compatibility
 * @deprecated Use UseAgentSessionEnrichmentReturn for new code
 */
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
 * 
 * @param eventId - Event ID to connect to
 * @param shouldConnect - Optional function that returns whether to connect. If not provided, connects unconditionally.
 */
export function useAgentSessions(
  eventId: string | null,
  shouldConnect?: () => boolean
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

    // Check if we should connect based on optional condition
    if (shouldConnect && !shouldConnect()) {
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
                websocket_state: status.websocket_state,
                ping_pong: status.ping_pong,
                metadata: status.metadata || {
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  closed_at: null,
                },
                runtime: status.runtime,
                token_metrics: status.token_metrics,
                recent_logs: status.recent_logs,
              };
              console.log('[useAgentSessions] Setting cards status:', updated.status, updated.session_id, 'WebSocket:', updated.websocket_state, 'Ping-Pong:', updated.ping_pong?.missedPongs || 0, 'missed');
              setCards(updated);
              setIsLoading(false);
              setError(null);
            } else if (status.agent_type === 'facts') {
              const updated: AgentSessionStatus = {
                agent_type: 'facts',
                session_id: status.session_id || 'unknown',
                status: status.status,
                websocket_state: status.websocket_state,
                ping_pong: status.ping_pong,
                metadata: status.metadata || {
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  closed_at: null,
                },
                runtime: status.runtime,
                token_metrics: status.token_metrics,
                recent_logs: status.recent_logs,
              };
              console.log('[useAgentSessions] Setting facts status:', updated.status, updated.session_id, 'WebSocket:', updated.websocket_state, 'Ping-Pong:', updated.ping_pong?.missedPongs || 0, 'missed');
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
  }, [eventId, shouldConnect]);

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
    setError(null);
    
    // Check if we should connect before attempting
    if (shouldConnect && !shouldConnect()) {
      console.log('[useAgentSessions] Reconnect skipped - shouldConnect returned false');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    
    // Force a complete reconnection after a brief delay
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log('[useAgentSessions] Reconnecting...');
      connect();
    }, 200);
  }, [connect, shouldConnect]);

  useEffect(() => {
    // Only connect if shouldConnect allows it (or if shouldConnect is not provided)
    if (!shouldConnect || shouldConnect()) {
      connect();
    } else {
      // If we shouldn't connect, close any existing connection and clear SSE state
      // The component should use initialSessions or polling instead
      if (eventSourceRef.current) {
        console.log('[useAgentSessions] Closing connection - shouldConnect returned false');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Clear SSE state when connection closes (sessions are paused/inactive)
      // Component will use initialSessions or polling for status
      setCards(null);
      setFacts(null);
      setError(null);
      setIsLoading(false); // CRITICAL: Set loading to false so UI shows "No active sessions" instead of stuck on loading
    }

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
  }, [connect, shouldConnect]);

  // Reset state when eventId changes
  useEffect(() => {
    setCards(null);
    setFacts(null);
    // Only set loading to true if we might need to connect
    // If shouldConnect is provided and returns false, we know we shouldn't connect, so set loading to false immediately
    if (shouldConnect && !shouldConnect()) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setError(null);
  }, [eventId, shouldConnect]);

  return {
    cards,
    facts,
    isLoading,
    error,
    reconnect,
  };
}

/**
 * Hook for managing agent session enrichment via SSE stream (enrichment-only)
 * Only receives real-time connection health data (websocket_state, ping_pong, logs, metrics)
 * Database state (status, metadata, session_id) should come from React Query
 * 
 * @param eventId - Event ID to connect to
 * @param sessionAgentTypes - Array of agent types that exist (only connect if sessions exist)
 */
export function useAgentSessionEnrichment(
  eventId: string | null,
  sessionAgentTypes: ('transcript' | 'cards' | 'facts')[]
): UseAgentSessionEnrichmentReturn {
  const [enrichment, setEnrichment] = useState<Map<'transcript' | 'cards' | 'facts', AgentSessionSSEEnrichment>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const shouldConnect = sessionAgentTypes.length > 0;

  const connect = useCallback(() => {
    if (!eventId || !shouldConnect) {
      setIsLoading(false);
      return;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      console.log('[useAgentSessionEnrichment] Closing existing connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsLoading(true);
    setError(null);

    console.log('[useAgentSessionEnrichment] Connecting to SSE stream for event:', eventId);

    try {
      const streamUrl = `/api/stream?event_id=${eventId}&_t=${Date.now()}`;
      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[useAgentSessionEnrichment] SSE connection opened');
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
            console.log('[useAgentSessionEnrichment] Connected to SSE stream');
            return;
          }

          // Handle agent_session_enrichment messages (new enrichment-only format)
          if (message.type === 'agent_session_enrichment') {
            const enrichmentData = message.payload as AgentSessionSSEEnrichment;
            console.log('[useAgentSessionEnrichment] Received enrichment update:', enrichmentData.agent_type);
            
            setEnrichment(prev => {
              const updated = new Map(prev);
              updated.set(enrichmentData.agent_type, enrichmentData);
              return updated;
            });
            
            setIsLoading(false);
            setError(null);
            return;
          }

          // Handle legacy agent_session_status messages (for backward compatibility during transition)
          // Extract only enrichment fields, ignore DB fields
          if (message.type === 'agent_session_status') {
            const status = message.payload as any;
            if (!status || !status.agent_type) return;

            const enrichmentData: AgentSessionSSEEnrichment = {
              agent_type: status.agent_type,
              websocket_state: status.websocket_state,
              ping_pong: status.ping_pong,
              recent_logs: status.recent_logs,
              // Only include metrics if session is active (real-time data)
              token_metrics: status.status === 'active' ? status.token_metrics : undefined,
              runtime_stats: status.status === 'active' ? status.runtime_stats : undefined,
            };

            console.log('[useAgentSessionEnrichment] Extracted enrichment from legacy message:', enrichmentData.agent_type);
            
            setEnrichment(prev => {
              const updated = new Map(prev);
              updated.set(enrichmentData.agent_type, enrichmentData);
              return updated;
            });
            
            setIsLoading(false);
            setError(null);
          }
        } catch (err) {
          console.error('[useAgentSessionEnrichment] Error parsing message:', err, event.data);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('[useAgentSessionEnrichment] SSE connection error, readyState:', eventSource.readyState);
        
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsLoading(false);
          setError(new Error('SSE connection closed'));
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[useAgentSessionEnrichment] Attempting to reconnect...');
            connect();
          }, 3000);
        } else if (eventSource.readyState === EventSource.CONNECTING) {
          console.log('[useAgentSessionEnrichment] Still connecting...');
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create SSE connection');
      setError(error);
      setIsLoading(false);
    }
  }, [eventId, shouldConnect]);

  const reconnect = useCallback(() => {
    console.log('[useAgentSessionEnrichment] Manual reconnect triggered');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    setEnrichment(new Map());
    setError(null);
    
    if (!shouldConnect) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, 200);
  }, [connect, shouldConnect]);

  useEffect(() => {
    if (shouldConnect) {
      connect();
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setEnrichment(new Map());
      setError(null);
      setIsLoading(false);
    }

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
  }, [connect, shouldConnect]);

  useEffect(() => {
    setEnrichment(new Map());
    if (!shouldConnect) {
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setError(null);
  }, [eventId, shouldConnect]);

  return {
    enrichment,
    isLoading,
    error,
    reconnect,
  };
}

