'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { EventWithStatus } from '@/shared/types/event';
import { getEvents } from '@/server/actions/event-actions';
import { format, parseISO } from 'date-fns';

interface EventsListProps {
  searchQuery?: string;
  statusFilter?: 'all' | 'scheduled' | 'live' | 'ended';
}

export function EventsList({ searchQuery = '', statusFilter = 'all' }: EventsListProps) {
  const [events, setEvents] = useState<EventWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await getEvents({
        search: searchQuery || undefined,
        status: statusFilter,
      });

      if (fetchError) {
        setError(fetchError);
        setEvents([]);
      } else {
        setEvents(data || []);
      }
      
      setLoading(false);
    }

    fetchEvents();
  }, [searchQuery, statusFilter]);

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return 'Not scheduled';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusColor = (status: EventWithStatus['status']): string => {
    switch (status) {
      case 'live':
        return '#10b981'; // green
      case 'scheduled':
        return '#3b82f6'; // blue
      case 'ended':
        return '#6b7280'; // gray
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: EventWithStatus['status']): string => {
    switch (status) {
      case 'live':
        return 'Live';
      case 'scheduled':
        return 'Scheduled';
      case 'ended':
        return 'Ended';
      default:
        return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: '#64748b',
      }}>
        <p style={{ fontSize: '16px', margin: 0 }}>Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: '#991b1b',
      }}>
        <p style={{ fontSize: '16px', margin: 0 }}>Error loading events: {error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: '#64748b',
      }}>
        <p style={{
          fontSize: '16px',
          margin: '0 0 8px 0',
        }}>
          No events found
        </p>
        <p style={{
          fontSize: '14px',
          margin: 0,
        }}>
          {searchQuery || statusFilter !== 'all'
            ? 'Try adjusting your search or filter criteria'
            : 'Create your first event to get started'}
        </p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/events/${event.id}/live`}
          style={{
            display: 'block',
            padding: '20px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#cbd5e1';
            e.currentTarget.style.boxShadow = '0 1px 3px 0 rgb(0 0 0 / 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '8px',
              }}>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#0f172a',
                  margin: 0,
                }}>
                  {event.title}
                </h3>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: `${getStatusColor(event.status)}20`,
                    color: getStatusColor(event.status),
                  }}
                >
                  {getStatusLabel(event.status)}
                </span>
              </div>
              
              {event.topic && (
                <p style={{
                  fontSize: '14px',
                  color: '#64748b',
                  margin: '0 0 12px 0',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {event.topic.replace(/[#*`]/g, '').substring(0, 150)}
                  {event.topic.length > 150 ? '...' : ''}
                </p>
              )}

              <div style={{
                display: 'flex',
                gap: '24px',
                fontSize: '13px',
                color: '#64748b',
              }}>
                <div>
                  <strong style={{ color: '#374151' }}>Start:</strong>{' '}
                  {formatDateTime(event.start_time)}
                </div>
                {event.end_time && (
                  <div>
                    <strong style={{ color: '#374151' }}>End:</strong>{' '}
                    {formatDateTime(event.end_time)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

