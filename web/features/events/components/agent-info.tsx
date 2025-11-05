'use client';

import { useState } from 'react';
import { useAgentInfo, AgentInfo as AgentInfoType } from '@/shared/hooks/useAgentInfo';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { ContextDatabaseVisualization } from '@/features/events/components/context-database-visualization';
import { GlossaryVisualization } from '@/features/context/components/glossary-visualization';
import { ResearchResultsVisualization } from '@/features/context/components/research-results-visualization';
import { VersionHistory } from '@/features/context/components/version-history';

interface AgentInfoProps {
  eventId: string;
}

export function AgentInfo({ eventId }: AgentInfoProps) {
  const { agent, contextStats, blueprint, loading, error } = useAgentInfo(eventId);
  const [isDatabaseExpanded, setIsDatabaseExpanded] = useState(false);
  const [isGlossaryExpanded, setIsGlossaryExpanded] = useState(false);
  const [isResearchExpanded, setIsResearchExpanded] = useState(false);

  const getStatusColor = (status: AgentInfoType['status'] | null, stage?: string | null): string => {
    if (!status) return '#6b7280';
    
    if (status === 'error') return '#ef4444'; // red
    if (status === 'ended') return '#6b7280'; // gray
    if (status === 'paused') return '#f59e0b'; // amber
    if (status === 'active') {
      return stage === 'running' ? '#3b82f6' : stage === 'testing' ? '#8b5cf6' : '#3b82f6'; // blue/purple
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint': return '#8b5cf6'; // purple
        case 'researching': return '#f59e0b'; // amber
        case 'building_glossary': return '#f59e0b'; // amber
        case 'building_chunks': return '#f59e0b'; // amber
        case 'regenerating_research': return '#f59e0b'; // amber
        case 'regenerating_glossary': return '#f59e0b'; // amber
        case 'regenerating_chunks': return '#f59e0b'; // amber
        case 'context_complete': return '#10b981'; // green
        case 'testing': return '#8b5cf6'; // purple
        case 'ready': return '#10b981'; // green
        case 'prepping': return '#f59e0b'; // amber
        default: return '#64748b'; // gray
      }
    }
    return '#6b7280';
  };

  const getStatusLabel = (status: AgentInfoType['status'] | null, stage?: string | null): string => {
    if (!status) return 'Unknown';
    
    if (status === 'error') return 'Error';
    if (status === 'ended') return 'Ended';
    if (status === 'paused') return 'Paused';
    if (status === 'active') {
      return stage === 'running' ? 'Running' : stage === 'testing' ? 'Testing' : 'Active';
    }
    if (status === 'idle') {
      switch (stage) {
        case 'blueprint': return 'Blueprint';
        case 'researching': return 'Researching';
        case 'building_glossary': return 'Building Glossary';
        case 'building_chunks': return 'Building Chunks';
        case 'regenerating_research': return 'Regenerating Research';
        case 'regenerating_glossary': return 'Regenerating Glossary';
        case 'regenerating_chunks': return 'Regenerating Chunks';
        case 'context_complete': return 'Context Complete';
        case 'testing': return 'Testing';
        case 'ready': return 'Ready';
        case 'prepping': return 'Prepping';
        default: return 'Idle';
      }
    }
    return 'Unknown';
  };

  // Loading state
  if (loading) {
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
            <div style={{
              height: '20px',
              background: '#e2e8f0',
              borderRadius: '4px',
              marginBottom: '8px',
              width: '200px',
            }} />
            <div style={{
              height: '16px',
              background: '#e2e8f0',
              borderRadius: '4px',
              width: '150px',
            }} />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #fee2e2',
        borderRadius: '12px',
        padding: '32px 24px',
        marginBottom: '24px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
          }}>
            ⚠️
          </div>
          <div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: '0 0 4px 0',
            }}>
              Agent Information
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#ef4444',
              margin: 0,
            }}>
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // No agent state
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
          <div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: '0 0 4px 0',
            }}>
              Agent Information
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

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (!agent) {
    return null;
  }

  const statusColor = getStatusColor(agent.status, agent.stage);
  const statusLabel = getStatusLabel(agent.status, agent.stage);

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '32px 24px',
      marginBottom: '24px',
    }}>
      {/* Header */}
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
            Agent Information
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: `${statusColor}20`,
                color: statusColor,
                border: `1px solid ${statusColor}40`,
              }}
            >
              {statusLabel}
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

      {/* Agent Details Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '20px',
        paddingTop: '20px',
        borderTop: '1px solid #e2e8f0',
        marginBottom: (contextStats || blueprint) ? '24px' : '0',
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
            fontSize: '13px',
            fontWeight: '500',
            color: '#0f172a',
            fontFamily: 'monospace',
            wordBreak: 'break-all',
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
            color: statusColor,
          }}>
            {statusLabel}
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
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Created
          </div>
          <div style={{
            fontSize: '13px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {formatDate(agent.created_at)}
          </div>
        </div>
      </div>

      {/* Context Statistics */}
      {contextStats && (
        <div style={{
          paddingTop: '24px',
          borderTop: '1px solid #e2e8f0',
          marginBottom: '24px',
        }}>
          <h4 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 16px 0',
          }}>
            Context Library
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
          }}>
            <div style={{
              padding: '16px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#3b82f6',
                marginBottom: '4px',
              }}>
                {contextStats.chunkCount.toLocaleString()}
              </div>
              <div style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Context Chunks
              </div>
              {blueprint?.target_chunk_count && (
                <div style={{
                  fontSize: '11px',
                  color: '#94a3b8',
                  marginTop: '4px',
                }}>
                  Target: {blueprint.target_chunk_count.toLocaleString()}
                </div>
              )}
            </div>
            <div style={{
              padding: '16px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{
                fontSize: '24px',
                fontWeight: '700',
                color: '#10b981',
                marginBottom: '4px',
              }}>
                {contextStats.glossaryTermCount.toLocaleString()}
              </div>
              <div style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Glossary Terms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blueprint Information */}
      {blueprint && (
        <div style={{
          paddingTop: '24px',
          borderTop: '1px solid #e2e8f0',
          marginBottom: '24px',
        }}>
          <h4 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 16px 0',
          }}>
            Context Blueprint
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
          }}>
            {blueprint.target_chunk_count && (
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '6px',
                }}>
                  Target Chunks
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#0f172a',
                }}>
                  {blueprint.target_chunk_count.toLocaleString()}
                </div>
              </div>
            )}
            {blueprint.quality_tier && (
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '6px',
                }}>
                  Quality Tier
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#0f172a',
                }}>
                  {blueprint.quality_tier}
                </div>
              </div>
            )}
            {blueprint.estimated_cost !== null && (
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '6px',
                }}>
                  Estimated Cost
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#0f172a',
                }}>
                  ${blueprint.estimated_cost.toFixed(2)}
                </div>
              </div>
            )}
            {blueprint.status && (
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '6px',
                }}>
                  Blueprint Status
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: blueprint.status === 'approved' || blueprint.status === 'completed' ? '#10b981' : '#64748b',
                }}>
                  {blueprint.status}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Generation Section */}
      <div style={{
        paddingTop: '24px',
        borderTop: '1px solid #e2e8f0',
        marginBottom: '24px',
      }}>
        <ContextGenerationPanel eventId={eventId} embedded={true} />
      </div>

      {/* Context Database Section - Collapsible */}
      {contextStats && contextStats.chunkCount > 0 && (
        <div style={{
          paddingTop: '24px',
          borderTop: '1px solid #e2e8f0',
          marginBottom: '24px',
        }}>
          <button
            onClick={() => setIsDatabaseExpanded(!isDatabaseExpanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              color: '#0f172a',
            }}
          >
            <span>Context Database ({contextStats.chunkCount.toLocaleString()} chunks)</span>
            <span style={{
              fontSize: '18px',
              transform: isDatabaseExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}>
              ▼
            </span>
          </button>
          {isDatabaseExpanded && (
            <div style={{
              marginTop: '16px',
            }}>
              <ContextDatabaseVisualization eventId={eventId} agentStatus={agent.status} agentStage={agent.stage} embedded={true} />
            </div>
          )}
        </div>
      )}

      {/* Glossary Section - Collapsible, only show when context is complete */}
      {agent.status === 'idle' && agent.stage === 'context_complete' && contextStats && contextStats.glossaryTermCount > 0 && (
        <div style={{
          paddingTop: '24px',
          borderTop: '1px solid #e2e8f0',
        }}>
          <button
            onClick={() => setIsGlossaryExpanded(!isGlossaryExpanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              color: '#0f172a',
            }}
          >
            <span>Glossary ({contextStats.glossaryTermCount.toLocaleString()} terms)</span>
            <span style={{
              fontSize: '18px',
              transform: isGlossaryExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}>
              ▼
            </span>
          </button>
          {isGlossaryExpanded && (
            <div style={{
              marginTop: '16px',
            }}>
              <GlossaryVisualization eventId={eventId} embedded={true} />
            </div>
          )}
        </div>
      )}

      {/* Research Results Section - Collapsible */}
      <div style={{
        paddingTop: '24px',
        borderTop: '1px solid #e2e8f0',
        marginBottom: '24px',
      }}>
        <button
          onClick={() => setIsResearchExpanded(!isResearchExpanded)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            color: '#0f172a',
          }}
        >
          <span>Research Results</span>
          <span style={{
            fontSize: '18px',
            transform: isResearchExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>
            ▼
          </span>
        </button>
        {isResearchExpanded && (
          <div style={{
            marginTop: '16px',
          }}>
            <ResearchResultsVisualization eventId={eventId} embedded={true} />
          </div>
        )}
      </div>

      {/* Version History Section - Collapsible */}
      <div style={{
        paddingTop: '24px',
        borderTop: '1px solid #e2e8f0',
        marginBottom: '24px',
      }}>
        <VersionHistory eventId={eventId} embedded={true} />
      </div>
    </div>
  );
}
