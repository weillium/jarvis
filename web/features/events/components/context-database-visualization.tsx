'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/shared/lib/supabase/client';

interface ContextItem {
  id: string;
  source: string;
  chunk: string;
  enrichment_source: string | null;
  quality_score: number | null;
  enrichment_timestamp: string | null;
  chunk_size: number | null;
  metadata: Record<string, any> | null;
  rank: number | null;
  research_source: string | null;
}

interface ContextStats {
  total: number;
  bySource: Record<string, number>;
  byEnrichmentSource: Record<string, number>;
  avgQualityScore: number;
  totalChars: number;
  byResearchSource?: Record<string, number>;
}

interface ContextDatabaseVisualizationProps {
  eventId: string;
  agentStatus: string | null;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
}

export function ContextDatabaseVisualization({ eventId, agentStatus, embedded = false }: ContextDatabaseVisualizationProps) {
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRealTime, setIsRealTime] = useState(false);
  const [filterByRank, setFilterByRank] = useState<string | null>(null);
  const [filterByResearchSource, setFilterByResearchSource] = useState<string | null>(null);

  // Calculate statistics
  useEffect(() => {
    if (contextItems.length === 0) {
      setStats(null);
      return;
    }

    const bySource: Record<string, number> = {};
    const byEnrichmentSource: Record<string, number> = {};
    let totalQuality = 0;
    let qualityCount = 0;
    let totalChars = 0;

    contextItems.forEach((item) => {
      // Count by source
      bySource[item.source] = (bySource[item.source] || 0) + 1;
      
      // Count by enrichment source
      const enrichmentSource = item.enrichment_source || item.source || 'unknown';
      byEnrichmentSource[enrichmentSource] = (byEnrichmentSource[enrichmentSource] || 0) + 1;
      
      // Quality score
      if (item.quality_score !== null) {
        totalQuality += item.quality_score;
        qualityCount++;
      }
      
      // Character count
      totalChars += item.chunk_size || item.chunk.length;
    });

    // Calculate unique research sources
    const byResearchSource: Record<string, number> = {};
    contextItems.forEach((item) => {
      const researchSource = item.research_source || 'none';
      byResearchSource[researchSource] = (byResearchSource[researchSource] || 0) + 1;
    });

    setStats({
      total: contextItems.length,
      bySource,
      byEnrichmentSource,
      avgQualityScore: qualityCount > 0 ? totalQuality / qualityCount : 0,
      totalChars,
      byResearchSource,
    });
  }, [contextItems]);

  // Initial fetch
  useEffect(() => {
    if (!eventId) return;

    async function fetchContextItems() {
      setLoading(true);
      try {
        const res = await fetch(`/api/context/${eventId}`);
        const result = await res.json();
        if (result.data) {
          setContextItems(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch context items:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchContextItems();
  }, [eventId]);

  // Real-time subscription for context_items
  useEffect(() => {
    if (!eventId || !isExpanded) return;

    console.log(`[context-db] Subscribing to context_items for event ${eventId}`);
    setIsRealTime(true);

    const channel = supabase
      .channel(`context_items:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'context_items',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('[context-db] New context item inserted:', payload.new);
          const newItem = payload.new as ContextItem;
          setContextItems((prev) => {
            // Avoid duplicates
            if (prev.some((item) => item.id === newItem.id)) {
              return prev;
            }
            return [...prev, newItem].sort((a, b) => {
              // Sort by enrichment_timestamp descending, then by created_at
              const aTime = a.enrichment_timestamp || '';
              const bTime = b.enrichment_timestamp || '';
              return bTime.localeCompare(aTime);
            });
          });
        }
      )
      .subscribe((status) => {
        console.log(`[context-db] Subscription status: ${status}`);
      });

    return () => {
      console.log(`[context-db] Unsubscribing from context_items for event ${eventId}`);
      supabase.removeChannel(channel);
      setIsRealTime(false);
    };
  }, [eventId, isExpanded]);

  const getSourceColor = (source: string): string => {
    switch (source) {
      case 'topic_prep':
      case 'llm_generation':
        return '#3b82f6'; // blue
      case 'enrichment':
      case 'web_search':
        return '#10b981'; // green
      case 'wikipedia':
        return '#8b5cf6'; // purple
      case 'document_extractor':
        return '#f59e0b'; // amber
      default:
        return '#64748b'; // gray
    }
  };

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'topic_prep':
        return 'Topic Prep (LLM)';
      case 'llm_generation':
        return 'LLM Generated';
      case 'web_search':
        return 'Web Search';
      case 'wikipedia':
        return 'Wikipedia';
      case 'document_extractor':
        return 'Documents';
      case 'enrichment':
        return 'Enrichment';
      default:
        return source;
    }
  };

  const isPrepping = agentStatus === 'prepping';
  const isReady = agentStatus === 'ready';
  const isRunning = agentStatus === 'running';

  // Filter context items
  const filteredItems = contextItems.filter((item) => {
    if (filterByRank && item.rank === null) return false;
    if (filterByRank === 'ranked' && item.rank === null) return false;
    if (filterByRank === 'unranked' && item.rank !== null) return false;
    if (filterByResearchSource && item.research_source !== filterByResearchSource) return false;
    return true;
  });

  // Get unique research sources for filter
  const researchSources = Array.from(
    new Set(contextItems.map((item) => item.research_source).filter(Boolean))
  ).sort() as string[];

  return (
    <div style={{
      background: embedded ? 'transparent' : '#ffffff',
      border: embedded ? 'none' : '1px solid #e2e8f0',
      borderRadius: embedded ? '0' : '12px',
      padding: embedded ? '0' : '24px',
      marginBottom: embedded ? '0' : '24px',
    }}>
      {/* Header */}
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
            Context Database
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            color: '#64748b',
          }}>
            <span>
              {loading ? 'Loading...' : `${stats?.total || 0} / 1,000 chunks`}
            </span>
            {isRealTime && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }} />
                Live
              </span>
            )}
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
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f8fafc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
          }}
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
          padding: '16px',
          background: '#f8fafc',
          borderRadius: '8px',
        }}>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '4px',
            }}>
              Total Chunks
            </div>
            <div style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#0f172a',
            }}>
              {stats.total}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '4px',
            }}>
              Avg Quality
            </div>
            <div style={{
              fontSize: '20px',
              fontWeight: '700',
              color: stats.avgQualityScore >= 0.7 ? '#10b981' : stats.avgQualityScore >= 0.4 ? '#f59e0b' : '#ef4444',
            }}>
              {(stats.avgQualityScore * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div style={{
              fontSize: '11px',
              fontWeight: '600',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '4px',
            }}>
              Total Chars
            </div>
            <div style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#0f172a',
            }}>
              {stats.totalChars.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Source Breakdown */}
      {stats && stats.byEnrichmentSource && Object.keys(stats.byEnrichmentSource).length > 0 && (
        <div style={{
          marginBottom: '20px',
          padding: '16px',
          background: '#f8fafc',
          borderRadius: '8px',
        }}>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
          }}>
            Source Breakdown
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            {Object.entries(stats.byEnrichmentSource).map(([source, count]) => (
              <div
                key={source}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: '#ffffff',
                  border: `1px solid ${getSourceColor(source)}`,
                  borderRadius: '6px',
                  fontSize: '13px',
                }}
              >
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: getSourceColor(source),
                }} />
                <span style={{ color: '#0f172a', fontWeight: '500' }}>
                  {getSourceLabel(source)}
                </span>
                <span style={{ color: '#64748b' }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Indicator - Only show during active building */}
      {isPrepping && contextItems.length === 0 && (
        <div style={{
          padding: '12px 16px',
          background: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '14px',
          color: '#92400e',
        }}>
          ⚡ Building context database... Chunks will appear here as they are generated.
          <div style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
            Agent status: <strong>{agentStatus}</strong> - The worker should be processing this every 3 seconds.
            {!isRealTime && ' Make sure the worker is running!'}
          </div>
        </div>
      )}

      {/* Filters */}
      {isExpanded && contextItems.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '20px',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}>
          <select
            value={filterByRank || ''}
            onChange={(e) => setFilterByRank(e.target.value || null)}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              background: '#ffffff',
            }}
          >
            <option value="">All Ranks</option>
            <option value="ranked">Ranked Only</option>
            <option value="unranked">Unranked Only</option>
          </select>
          {researchSources.length > 0 && (
            <select
              value={filterByResearchSource || ''}
              onChange={(e) => setFilterByResearchSource(e.target.value || null)}
              style={{
                padding: '6px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                background: '#ffffff',
              }}
            >
              <option value="">All Research Sources</option>
              {researchSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          )}
          {(filterByRank || filterByResearchSource) && (
            <button
              onClick={() => {
                setFilterByRank(null);
                setFilterByResearchSource(null);
              }}
              style={{
                padding: '6px 12px',
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

      {/* Expanded View */}
      {isExpanded && (
        <div style={{
          marginTop: '20px',
          maxHeight: '600px',
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#f8fafc',
        }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              Loading context items...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              {(filterByRank || filterByResearchSource)
                ? 'No context items match the selected filters.'
                : contextItems.length === 0
                ? 'No context items found. Expand to view chunks when they are available.'
                : 'No context items match the current filters.'}
            </div>
          ) : (
            <div style={{ padding: '8px' }}>
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '16px',
                    marginBottom: '8px',
                    background: '#ffffff',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px',
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      {item.rank !== null && (
                        <div style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          borderRadius: '4px',
                          fontWeight: '600',
                        }}>
                          Rank: {item.rank}
                        </div>
                      )}
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: getSourceColor(item.enrichment_source || item.source || 'unknown'),
                      }} />
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#64748b',
                        textTransform: 'uppercase',
                      }}>
                        {getSourceLabel(item.enrichment_source || item.source || 'unknown')}
                      </div>
                      {item.research_source && (
                        <div style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: '#f3f4f6',
                          color: '#374151',
                          borderRadius: '4px',
                          fontWeight: '500',
                        }}>
                          Research: {item.research_source}
                        </div>
                      )}
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      {item.quality_score !== null && (
                        <div style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: item.quality_score >= 0.7 ? '#dcfce7' : item.quality_score >= 0.4 ? '#fef3c7' : '#fee2e2',
                          color: '#0f172a',
                          borderRadius: '4px',
                          fontWeight: '500',
                        }}>
                          Quality: {(item.quality_score * 100).toFixed(0)}%
                        </div>
                      )}
                      {item.chunk_size && (
                        <div style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                        }}>
                          {item.chunk_size} chars
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: '#374151',
                    lineHeight: '1.6',
                    marginBottom: '8px',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {item.chunk}
                  </div>
                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <details style={{
                      fontSize: '11px',
                      color: '#64748b',
                      marginTop: '8px',
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
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                  {item.enrichment_timestamp && (
                    <div style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      marginTop: '4px',
                    }}>
                      Added: {new Date(item.enrichment_timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}

