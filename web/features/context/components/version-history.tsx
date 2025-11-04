'use client';

import { useState, useEffect } from 'react';

interface VersionHistoryProps {
  eventId: string;
  embedded?: boolean;
}

interface GenerationCycle {
  id: string;
  cycle_type: string;
  component: string | null;
  status: string;
  progress_current: number;
  progress_total: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  version: number;
  parent_cycle_id: string | null;
  cost?: number | null;
  cost_breakdown?: {
    total: number;
    currency: string;
    breakdown: Record<string, any>;
    pricing_version?: string;
  } | null;
  metadata?: {
    cost?: {
      total: number;
      currency: string;
      breakdown: Record<string, any>;
      pricing_version?: string;
    };
  };
}

interface VersionData {
  ok: boolean;
  cycles: GenerationCycle[];
  count: number;
}

export function VersionHistory({ eventId, embedded = false }: VersionHistoryProps) {
  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(embedded); // Auto-expand when embedded
  const [filterByType, setFilterByType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchVersionHistory = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/context/${eventId}/versions`);
      const data = await res.json();
      if (data.ok) {
        setVersionData(data);
      }
    } catch (err) {
      console.error('Failed to fetch version history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVersionHistory();
  }, [eventId]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return '#10b981'; // green
      case 'processing':
        return '#3b82f6'; // blue
      case 'started':
        return '#f59e0b'; // amber
      case 'failed':
        return '#ef4444'; // red
      case 'superseded':
        return '#64748b'; // gray
      default:
        return '#64748b';
    }
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'research':
        return 'Research';
      case 'glossary':
        return 'Glossary';
      case 'chunks':
        return 'Chunks';
      case 'full':
        return 'Full Generation';
      default:
        return type;
    }
  };

  const filteredCycles = versionData?.cycles.filter((cycle) => {
    if (filterByType && cycle.cycle_type !== filterByType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesQuery = cycle.cycle_type.toLowerCase().includes(query) ||
                           (cycle.component && cycle.component.toLowerCase().includes(query)) ||
                           (cycle.status && cycle.status.toLowerCase().includes(query)) ||
                           (cycle.error_message && cycle.error_message.toLowerCase().includes(query));
      if (!matchesQuery) return false;
    }
    return true;
  }) || [];

  const uniqueTypes = versionData
    ? Array.from(new Set(versionData.cycles.map((c) => c.cycle_type))).sort()
    : [];

  if (loading) {
    return (
      <div style={{
        background: embedded ? 'transparent' : '#ffffff',
        border: embedded ? 'none' : '1px solid #e2e8f0',
        borderRadius: embedded ? '0' : '12px',
        padding: embedded ? '0' : '24px',
        marginBottom: embedded ? '0' : '24px',
      }}>
        <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
          Loading version history...
        </div>
      </div>
    );
  }

  if (!versionData || versionData.count === 0) {
    return null; // Don't show if no history
  }

  return (
    <div style={{
      background: embedded ? 'transparent' : '#ffffff',
      border: embedded ? 'none' : '1px solid #e2e8f0',
      borderRadius: embedded ? '0' : '12px',
      padding: embedded ? '0' : '24px',
      marginBottom: embedded ? '0' : '24px',
    }}>
      {/* Header - only show when not embedded */}
      {!embedded && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: '0 0 4px 0',
            }}>
              Version History
            </h3>
            <div style={{
              fontSize: '13px',
              color: '#64748b',
            }}>
              {versionData.count} {versionData.count === 1 ? 'generation cycle' : 'generation cycles'}
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              padding: '8px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              background: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      )}

      {/* Search and Filters */}
      {isExpanded && uniqueTypes.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search cycles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <button
            onClick={fetchVersionHistory}
            disabled={refreshing}
            style={{
              padding: '8px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              background: '#ffffff',
              color: '#374151',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {refreshing ? '↻' : '↻'} {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <select
            value={filterByType || ''}
            onChange={(e) => setFilterByType(e.target.value || null)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              background: '#ffffff',
            }}
          >
            <option value="">All Types</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {getTypeLabel(type)}
              </option>
            ))}
          </select>
          {(filterByType || searchQuery) && (
            <button
              onClick={() => {
                setFilterByType(null);
                setSearchQuery('');
              }}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                background: '#ffffff',
                cursor: 'pointer',
                color: '#64748b',
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Cycles List */}
      {isExpanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {filteredCycles.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              No cycles match the selected filter.
            </div>
          ) : (
            filteredCycles.map((cycle) => (
              <div
                key={cycle.id}
                style={{
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#0f172a',
                    }}>
                      {getTypeLabel(cycle.cycle_type)}
                    </span>
                    {cycle.version > 1 && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        background: '#e0e7ff',
                        color: '#4338ca',
                        borderRadius: '4px',
                        fontWeight: '500',
                      }}>
                        v{cycle.version}
                      </span>
                    )}
                    {cycle.component && cycle.component !== cycle.cycle_type && (
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        background: '#f3f4f6',
                        color: '#64748b',
                        borderRadius: '4px',
                      }}>
                        {cycle.component}
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    {cycle.cost !== null && cycle.cost !== undefined && (
                      <span style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        background: '#ecfdf5',
                        color: '#065f46',
                        borderRadius: '4px',
                        fontWeight: '600',
                        border: '1px solid #a7f3d0',
                      }}>
                        ${cycle.cost.toFixed(4)}
                      </span>
                    )}
                    <span style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      background: getStatusColor(cycle.status),
                      color: '#ffffff',
                      borderRadius: '4px',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                    }}>
                      {cycle.status}
                    </span>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  fontSize: '12px',
                  color: '#64748b',
                }}>
                  {cycle.progress_total > 0 && (
                    <span>
                      Progress: {cycle.progress_current} / {cycle.progress_total} (
                      {Math.round((cycle.progress_current / cycle.progress_total) * 100)}%)
                    </span>
                  )}
                  <span>
                    Started: {new Date(cycle.started_at).toLocaleString()}
                  </span>
                  {cycle.completed_at && (
                    <span>
                      Completed: {new Date(cycle.completed_at).toLocaleString()}
                    </span>
                  )}
                </div>
                {cycle.error_message && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: '#fee2e2',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#991b1b',
                  }}>
                    <strong>Error:</strong> {cycle.error_message}
                  </div>
                )}
                {cycle.parent_cycle_id && (
                  <div style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    color: '#94a3b8',
                  }}>
                    Parent cycle: {cycle.parent_cycle_id.substring(0, 8)}...
                  </div>
                )}
                {cycle.cost_breakdown && (
                  <details style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    fontSize: '11px',
                  }}>
                    <summary style={{
                      cursor: 'pointer',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '4px',
                    }}>
                      Cost Breakdown
                    </summary>
                    <div style={{
                      marginTop: '4px',
                      paddingLeft: '12px',
                      color: '#64748b',
                    }}>
                      <div><strong>Total:</strong> ${cycle.cost_breakdown.total.toFixed(4)} {cycle.cost_breakdown.currency}</div>
                      {cycle.cost_breakdown.breakdown?.openai && (
                        <div style={{ marginTop: '4px' }}>
                          <strong>OpenAI:</strong> ${cycle.cost_breakdown.breakdown.openai.total.toFixed(4)}
                          {cycle.cost_breakdown.breakdown.openai.chat_completions?.length > 0 && (
                            <span> ({cycle.cost_breakdown.breakdown.openai.chat_completions.length} chat completion{cycle.cost_breakdown.breakdown.openai.chat_completions.length > 1 ? 's' : ''})</span>
                          )}
                          {cycle.cost_breakdown.breakdown.openai.embeddings?.length > 0 && (
                            <span> ({cycle.cost_breakdown.breakdown.openai.embeddings.length} embedding{cycle.cost_breakdown.breakdown.openai.embeddings.length > 1 ? 's' : ''})</span>
                          )}
                        </div>
                      )}
                      {cycle.cost_breakdown.breakdown?.exa && (
                        <div style={{ marginTop: '4px' }}>
                          <strong>Exa:</strong> ${cycle.cost_breakdown.breakdown.exa.total.toFixed(4)}
                          {cycle.cost_breakdown.breakdown.exa.search?.queries > 0 && (
                            <span> ({cycle.cost_breakdown.breakdown.exa.search.queries} search{cycle.cost_breakdown.breakdown.exa.search.queries > 1 ? 'es' : ''})</span>
                          )}
                          {cycle.cost_breakdown.breakdown.exa.research?.queries > 0 && (
                            <span> ({cycle.cost_breakdown.breakdown.exa.research.queries} research task{cycle.cost_breakdown.breakdown.exa.research.queries > 1 ? 's' : ''})</span>
                          )}
                          {cycle.cost_breakdown.breakdown.exa.answer?.queries > 0 && (
                            <span> ({cycle.cost_breakdown.breakdown.exa.answer.queries} answer{cycle.cost_breakdown.breakdown.exa.answer.queries > 1 ? 's' : ''})</span>
                          )}
                        </div>
                      )}
                      {cycle.cost_breakdown.pricing_version && (
                        <div style={{ marginTop: '4px', fontSize: '10px', color: '#94a3b8' }}>
                          Pricing version: {cycle.cost_breakdown.pricing_version}
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

