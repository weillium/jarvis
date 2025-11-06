'use client';

import { useState, useEffect } from 'react';
import { useTranscriptsQuery } from '@/shared/hooks/use-transcripts-query';
import { useSSEStream } from '@/shared/hooks/use-sse-stream';
import type { SSEMessage } from '@/shared/types/card';
import { formatDistanceToNow } from 'date-fns';

interface LiveTranscriptsProps {
  eventId: string;
}

/**
 * Live Transcripts Component
 * Displays transcripts that are currently in the ring buffer (last 5 minutes, up to 1000)
 */
export function LiveTranscripts({ eventId }: LiveTranscriptsProps) {
  const { data, isLoading, error } = useTranscriptsQuery(eventId);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const { isConnected, isConnecting, reconnect } = useSSEStream({
    eventId,
    onMessage: (_message: SSEMessage) => {
      // No-op, we're just using this for connection status
    },
    onConnect: () => {
      setConnectionStatus('connected');
    },
    onDisconnect: () => {
      setConnectionStatus('disconnected');
    },
    onError: () => {
      setConnectionStatus('disconnected');
    },
  });

  // Update connection status based on hook state
  useEffect(() => {
    if (isConnecting) {
      setConnectionStatus('connecting');
    } else if (isConnected) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [isConnected, isConnecting]);

  if (isLoading) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '14px',
        }}
      >
        Loading transcripts...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#dc2626',
          fontSize: '14px',
        }}
      >
        Error loading transcripts: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  const transcripts = data?.transcripts || [];

  return (
    <div>
      {/* Connection Status */}
      <div
        style={{
          marginBottom: '20px',
          padding: '12px 16px',
          background: connectionStatus === 'connected' ? '#f0fdf4' : connectionStatus === 'connecting' ? '#fffbeb' : '#fef2f2',
          border: `1px solid ${connectionStatus === 'connected' ? '#86efac' : connectionStatus === 'connecting' ? '#fde047' : '#fca5a5'}`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'connecting' ? '#eab308' : '#ef4444',
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: connectionStatus === 'connected' ? '#166534' : connectionStatus === 'connecting' ? '#854d0e' : '#991b1b',
            }}
          >
            {connectionStatus === 'connected'
              ? 'Connected - Receiving live updates'
              : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'Disconnected'}
          </span>
        </div>
        {connectionStatus === 'disconnected' && (
          <button
            onClick={reconnect}
            style={{
              padding: '6px 12px',
              background: '#1e293b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Reconnect
          </button>
        )}
      </div>

      {transcripts.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '14px',
          }}
        >
          No transcripts in ring buffer yet. Transcripts will appear as they are processed during the event.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: 'calc(100vh - 300px)',
            overflowY: 'auto',
          }}
        >
          {transcripts.map((transcript) => {
            const timestamp = new Date(transcript.at_ms);
            const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

            return (
              <div
                key={transcript.id}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {transcript.speaker && (
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#475569',
                          marginBottom: '4px',
                        }}
                      >
                        {transcript.speaker}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '15px',
                        color: '#334155',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {transcript.text}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '4px',
                      minWidth: '120px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#94a3b8',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {timeAgo}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#cbd5e1',
                        fontFamily: 'monospace',
                      }}
                    >
                      Seq: {transcript.seq}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

