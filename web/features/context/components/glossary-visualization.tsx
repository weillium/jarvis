'use client';

import { useState } from 'react';
import { useGlossaryQuery } from '@/shared/hooks/use-glossary-query';

interface GlossaryVisualizationProps {
  eventId: string;
  embedded?: boolean; // If true, removes outer wrapper styling for embedding
}

export function GlossaryVisualization({ eventId, embedded = false }: GlossaryVisualizationProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set());
  
  const { data: glossaryData, isLoading, error, refetch, isFetching } = useGlossaryQuery(eventId, {
    category: selectedCategory,
    search: search || undefined,
  });

  const handleRefresh = () => {
    refetch();
  };

  const toggleTerm = (termId: string) => {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) {
        next.delete(termId);
      } else {
        next.add(termId);
      }
      return next;
    });
  };

  // Get unique categories
  const categories = glossaryData
    ? Array.from(new Set(glossaryData.terms.map((t) => t.category || 'uncategorized')))
    : [];

  // Filter terms based on search (client-side if needed)
  const displayTerms = glossaryData?.terms || [];

  if (isLoading) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        color: '#64748b',
      }}>
        Loading glossary...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        color: '#ef4444',
      }}>
        Error loading glossary: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  if (!glossaryData || glossaryData.count === 0) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        color: '#64748b',
      }}>
        <p>No glossary terms available yet.</p>
      </div>
    );
  }

  return (
    <div style={{
      background: embedded ? 'transparent' : '#ffffff',
      border: embedded ? 'none' : '1px solid #e2e8f0',
      borderRadius: embedded ? '0' : '12px',
      padding: embedded ? '0' : '24px',
    }}>
      {/* Header - only show when not embedded */}
      {!embedded && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#0f172a',
            margin: 0,
          }}>
            Glossary
          </h3>
          <span style={{
            fontSize: '14px',
            color: '#64748b',
          }}>
            {glossaryData.count} {glossaryData.count === 1 ? 'term' : 'terms'}
          </span>
        </div>
      )}

      {/* Search and Filter */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search terms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
          onClick={handleRefresh}
          disabled={isFetching}
          style={{
            padding: '8px 16px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            background: '#ffffff',
            color: '#374151',
            cursor: isFetching ? 'not-allowed' : 'pointer',
            opacity: isFetching ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          ↻ {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
        {categories.length > 0 && (
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#ffffff',
            }}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Terms List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {displayTerms.map((term) => {
          const isExpanded = expandedTerms.has(term.id);

          return (
            <div
              key={term.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Term Header */}
              <div
                onClick={() => toggleTerm(term.id)}
                style={{
                  padding: '12px 16px',
                  background: isExpanded ? '#f8fafc' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px',
                  }}>
                    <span style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#0f172a',
                    }}>
                      {term.term}
                    </span>
                    {term.acronym_for && (
                      <span style={{
                        fontSize: '12px',
                        color: '#64748b',
                        fontStyle: 'italic',
                      }}>
                        ({term.acronym_for})
                      </span>
                    )}
                    {term.category && (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: '#e0e7ff',
                        color: '#4338ca',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '500',
                      }}>
                        {term.category}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#64748b',
                    lineHeight: '1.4',
                  }}>
                    {term.definition}
                  </div>
                </div>
                <div style={{
                  fontSize: '20px',
                  color: '#64748b',
                  marginLeft: '16px',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}>
                  ▶
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                }}>
                  {/* Usage Examples */}
                  {term.usage_examples && term.usage_examples.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <h5 style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#64748b',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                      }}>
                        Usage Examples
                      </h5>
                      <ul style={{
                        margin: 0,
                        paddingLeft: '20px',
                        color: '#475569',
                        fontSize: '14px',
                      }}>
                        {term.usage_examples.map((example, i) => (
                          <li key={i} style={{ marginBottom: '4px', fontStyle: 'italic' }}>
                            "{example}"
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Related Terms */}
                  {term.related_terms && term.related_terms.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <h5 style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#64748b',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                      }}>
                        Related Terms
                      </h5>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {term.related_terms.map((related, i) => (
                          <span
                            key={i}
                            style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              background: '#e2e8f0',
                              color: '#475569',
                              borderRadius: '4px',
                              fontSize: '12px',
                            }}
                          >
                            {related}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div style={{
                    display: 'flex',
                    gap: '16px',
                    fontSize: '12px',
                    color: '#64748b',
                    paddingTop: '12px',
                    borderTop: '1px solid #e2e8f0',
                  }}>
                    {term.confidence_score !== null && (
                      <div>
                        <strong>Confidence:</strong> {(term.confidence_score * 100).toFixed(0)}%
                      </div>
                    )}
                    {term.agent_utility && term.agent_utility.length > 0 && (
                      <div>
                        <strong>Agent Utility:</strong>{' '}
                        {term.agent_utility
                          .map((agent) => agent.charAt(0).toUpperCase() + agent.slice(1))
                          .join(', ')}
                      </div>
                    )}
                    {term.source && (
                      <div>
                        <strong>Source:</strong> {term.source}
                      </div>
                    )}
                    {term.source_url && (
                      <div>
                        <a
                          href={term.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6', textDecoration: 'none' }}
                        >
                          View Source →
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
