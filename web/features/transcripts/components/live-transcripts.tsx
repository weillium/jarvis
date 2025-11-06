'use client';

import { useTranscriptsQuery } from '@/shared/hooks/use-transcripts-query';
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h2
          style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#0f172a',
            margin: 0,
          }}
        >
          Ring Buffer Transcripts
        </h2>
        <div
          style={{
            fontSize: '13px',
            color: '#64748b',
          }}
        >
          {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} (last 5 minutes)
        </div>
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

