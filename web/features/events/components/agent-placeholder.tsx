'use client';

import { useState } from 'react';
import { Agent } from '@/shared/types/agent';

interface ContextItem {
  id: string;
  source: string;
  chunk: string;
  enrichment_source: string | null;
  quality_score: number | null;
  enrichment_timestamp: string | null;
  chunk_size: number | null;
  metadata: Record<string, any> | null;
}

interface AgentPlaceholderProps {
  agent: Agent | null;
  eventId: string;
}

export function AgentPlaceholder({ agent, eventId }: AgentPlaceholderProps) {
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const getStatusColor = (status: Agent['status']): string => {
    switch (status) {
      case 'ready':
        return '#10b981'; // green
      case 'running':
        return '#3b82f6'; // blue
      case 'prepping':
        return '#f59e0b'; // amber
      case 'ended':
        return '#6b7280'; // gray
      case 'error':
        return '#ef4444'; // red
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: Agent['status']): string => {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'running':
        return 'Running';
      case 'prepping':
        return 'Prepping';
      case 'ended':
        return 'Ended';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  if (!agent) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '32px 24px',
        marginBottom: '24px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}>
            🤖
          </div>
          <div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: '0 0 4px 0',
            }}>
              Agent
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#64748b',
              margin: 0,
            }}>
              No agent associated with this event
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '32px 24px',
      marginBottom: '24px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
        }}>
          🤖
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 8px 0',
          }}>
            Agent
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: `${getStatusColor(agent.status)}20`,
                color: getStatusColor(agent.status),
              }}
            >
              {getStatusLabel(agent.status)}
            </span>
            <span style={{
              fontSize: '13px',
              color: '#64748b',
            }}>
              Model: {agent.model}
            </span>
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #e2e8f0',
      }}>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Agent ID
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#0f172a',
            fontFamily: 'monospace',
          }}>
            {agent.id.substring(0, 8)}...
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Status
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: getStatusColor(agent.status),
          }}>
            {getStatusLabel(agent.status)}
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Model
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {agent.model}
          </div>
        </div>
      </div>

      {/* Context Items Section */}
      <div style={{
        marginTop: '24px',
        paddingTop: '24px',
        borderTop: '1px solid #e2e8f0',
      }}>
        <button
          onClick={async () => {
            if (!isContextExpanded && contextItems.length === 0) {
              setContextLoading(true);
              try {
                const res = await fetch(`/api/context/${eventId}`);
                const result = await res.json();
                if (result.data) {
                  setContextItems(result.data);
                }
              } catch (error) {
                console.error('Failed to fetch context items:', error);
              } finally {
                setContextLoading(false);
              }
            }
            setIsContextExpanded(!isContextExpanded);
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'transparent',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            color: '#0f172a',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f8fafc';
            e.currentTarget.style.borderColor = '#cbd5e1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }}
        >
          <span>
            Context Items {contextItems.length > 0 && `(${contextItems.length})`}
          </span>
          <span style={{
            fontSize: '18px',
            transform: isContextExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>
            ▼
          </span>
        </button>

        {isContextExpanded && (
          <div style={{
            marginTop: '16px',
            maxHeight: '400px',
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            background: '#f8fafc',
          }}>
            {contextLoading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                Loading context items...
              </div>
            ) : contextItems.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                No context items found. Context will be generated when agent status is 'prepping'.
              </div>
            ) : (
              <div style={{ padding: '8px' }}>
                {contextItems.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      background: '#ffffff',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                    }}>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#64748b',
                        textTransform: 'uppercase',
                      }}>
                        {item.enrichment_source || item.source || 'Unknown'}
                      </div>
                      {item.quality_score !== null && (
                        <div style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: item.quality_score >= 0.7 ? '#dcfce7' : item.quality_score >= 0.4 ? '#fef3c7' : '#fee2e2',
                          color: '#0f172a',
                          borderRadius: '4px',
                        }}>
                          Quality: {(item.quality_score * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#374151',
                      lineHeight: '1.5',
                      maxHeight: '100px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {item.chunk}
                    </div>
                    {item.chunk_size && (
                      <div style={{
                        fontSize: '11px',
                        color: '#94a3b8',
                        marginTop: '4px',
                      }}>
                        {item.chunk_size} chars
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

