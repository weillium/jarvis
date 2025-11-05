'use client';

import { useState, useEffect } from 'react';

interface ResearchResultsVisualizationProps {
  eventId: string;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
}

interface ResearchResult {
  id: string;
  query: string;
  api: string;
  content: string;
  source_url: string | null;
  quality_score: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  generation_cycle_id: string | null;
}

interface ResearchData {
  ok: boolean;
  results: ResearchResult[];
  count: number;
  byApi: Record<string, number>;
  avgQualityScore: number;
}

export function ResearchResultsVisualization({ eventId, embedded = false }: ResearchResultsVisualizationProps) {
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(embedded); // Auto-expand when embedded
  const [filterByApi, setFilterByApi] = useState<string | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchResearchResults = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/context/${eventId}/research`);
      const data = await res.json();
      if (data.ok) {
        setResearchData(data);
      }
    } catch (err) {
      console.error('Failed to fetch research results:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchResearchResults();
  }, [eventId]);

  const toggleResult = (resultId: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  const getApiColor = (api: string): string => {
    switch (api) {
      case 'exa':
        return '#10b981'; // green
      case 'wikipedia':
        return '#8b5cf6'; // purple
      case 'llm_stub':
        return '#3b82f6'; // blue
      default:
        return '#64748b'; // gray
    }
  };

  const getApiLabel = (api: string): string => {
    switch (api) {
      case 'exa':
        return 'Exa Search';
      case 'wikipedia':
        return 'Wikipedia';
      case 'llm_stub':
        return 'LLM Stub';
      default:
        return api;
    }
  };

  // Filter results
  const filteredResults = researchData?.results.filter((result) => {
    if (filterByApi && result.api !== filterByApi) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesQuery = result.query.toLowerCase().includes(query) ||
                           result.content.toLowerCase().includes(query);
      if (!matchesQuery) return false;
    }
    return true;
  }) || [];

  // Get unique APIs for filter
  const apis = researchData
    ? Array.from(new Set(researchData.results.map((r) => r.api))).sort()
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
          Loading research results...
        </div>
      </div>
    );
  }

  if (!researchData || researchData.count === 0) {
    return (
      <div style={{
        background: embedded ? 'transparent' : '#ffffff',
        border: embedded ? 'none' : '1px solid #e2e8f0',
        borderRadius: embedded ? '0' : '12px',
        padding: embedded ? '0' : '24px',
        marginBottom: embedded ? '0' : '24px',
      }}>
        <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
          <p>No research results available yet.</p>
          <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.8 }}>
            Research results will appear here after the research phase completes.
          </p>
        </div>
      </div>
    );
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
              Research Results
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '13px',
              color: '#64748b',
            }}>
              <span>
                {researchData.count} {researchData.count === 1 ? 'result' : 'results'}
              </span>
              {researchData.avgQualityScore > 0 && (
                <span>
                  Avg Quality: {(researchData.avgQualityScore * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        {!embedded && (
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
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
            }}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      )}

      {/* Stats Overview */}
      {researchData.byApi && Object.keys(researchData.byApi).length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
          padding: '16px',
          background: '#f8fafc',
          borderRadius: '8px',
        }}>
          {Object.entries(researchData.byApi).map(([api, count]) => (
            <div key={api}>
              <div style={{
                fontSize: '11px',
                fontWeight: '600',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '4px',
              }}>
                {getApiLabel(api)}
              </div>
              <div style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#0f172a',
              }}>
                {count}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search and Filters */}
      {isExpanded && researchData.count > 0 && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search results..."
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
            onClick={fetchResearchResults}
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
          {apis.length > 0 && (
            <select
              value={filterByApi || ''}
              onChange={(e) => setFilterByApi(e.target.value || null)}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                background: '#ffffff',
              }}
            >
              <option value="">All APIs</option>
              {apis.map((api) => (
                <option key={api} value={api}>
                  {getApiLabel(api)}
                </option>
              ))}
            </select>
          )}
          {(filterByApi || searchQuery) && (
            <button
              onClick={() => {
                setFilterByApi(null);
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

      {/* Results List */}
      {isExpanded && (
        <div style={{
          marginTop: '20px',
          maxHeight: '600px',
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#f8fafc',
        }}>
          {filteredResults.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              No research results match the selected filter.
            </div>
          ) : (
            <div style={{ padding: '8px' }}>
              {filteredResults.map((result) => {
                const isExpandedResult = expandedResults.has(result.id);
                return (
                  <div
                    key={result.id}
                    style={{
                      padding: '16px',
                      marginBottom: '8px',
                      background: '#ffffff',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.2s',
                    }}
                  >
                    {/* Result Header */}
                    <div
                      onClick={() => toggleResult(result.id)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        cursor: 'pointer',
                        marginBottom: isExpandedResult ? '12px' : '0',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: getApiColor(result.api),
                          }} />
                          <span style={{
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#64748b',
                            textTransform: 'uppercase',
                          }}>
                            {getApiLabel(result.api)}
                          </span>
                        </div>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#0f172a',
                          marginBottom: '4px',
                        }}>
                          Query: {result.query}
                        </div>
                        {!isExpandedResult && (
                          <div style={{
                            fontSize: '13px',
                            color: '#64748b',
                            lineHeight: '1.5',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}>
                            {result.content}
                          </div>
                        )}
                      </div>
                      <div style={{
                        fontSize: '20px',
                        color: '#64748b',
                        marginLeft: '16px',
                        transform: isExpandedResult ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}>
                        ▶
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpandedResult && (
                      <div style={{
                        paddingTop: '12px',
                        borderTop: '1px solid #e2e8f0',
                      }}>
                        <div style={{
                          fontSize: '13px',
                          color: '#374151',
                          lineHeight: '1.6',
                          marginBottom: '12px',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {result.content}
                        </div>
                        <div style={{
                          display: 'flex',
                          gap: '16px',
                          fontSize: '12px',
                          color: '#64748b',
                          paddingTop: '12px',
                          borderTop: '1px solid #e2e8f0',
                        }}>
                          {result.quality_score !== null && (
                            <div>
                              <strong>Quality:</strong> {(result.quality_score * 100).toFixed(0)}%
                            </div>
                          )}
                          {result.source_url && (
                            <div>
                              <a
                                href={result.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#3b82f6', textDecoration: 'none' }}
                              >
                                View Source →
                              </a>
                            </div>
                          )}
                          <div>
                            <strong>Created:</strong> {new Date(result.created_at).toLocaleString()}
                          </div>
                        </div>
                        {result.metadata && Object.keys(result.metadata).length > 0 && (
                          <details style={{
                            marginTop: '12px',
                            fontSize: '11px',
                            color: '#64748b',
                          }}>
                            <summary style={{
                              cursor: 'pointer',
                              fontWeight: '500',
                            }}>
                              Metadata
                            </summary>
                            <pre style={{
                              marginTop: '8px',
                              padding: '8px',
                              background: '#f8fafc',
                              borderRadius: '4px',
                              overflow: 'auto',
                              fontSize: '11px',
                            }}>
                              {JSON.stringify(result.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

