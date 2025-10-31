'use client';

import { EventWithStatus } from '@/shared/types/event';
import { format, parseISO } from 'date-fns';

interface EventDetailProps {
  event: EventWithStatus;
}

export function EventDetail({ event }: EventDetailProps) {
  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return 'Not scheduled';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Not scheduled';
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
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

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '32px',
      marginBottom: '24px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '24px',
        gap: '16px',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px',
          }}>
            <h1 style={{
              fontSize: '32px',
              fontWeight: '700',
              color: '#0f172a',
              margin: 0,
            }}>
              {event.title}
            </h1>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: `${getStatusColor(event.status)}20`,
                color: getStatusColor(event.status),
              }}
            >
              {getStatusLabel(event.status)}
            </span>
          </div>
        </div>
      </div>

      {event.topic && (
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#374151',
            margin: '0 0 12px 0',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Description
          </h3>
          <div
            style={{
              fontSize: '15px',
              color: '#374151',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
            }}
          >
            {event.topic}
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '24px',
      }}>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}>
            Start Time
          </div>
          <div style={{
            fontSize: '16px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {formatDateTime(event.start_time)}
          </div>
          {event.start_time && (
            <div style={{
              fontSize: '13px',
              color: '#64748b',
              marginTop: '4px',
            }}>
              {formatDate(event.start_time)}
            </div>
          )}
        </div>

        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}>
            End Time
          </div>
          <div style={{
            fontSize: '16px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {formatDateTime(event.end_time)}
          </div>
          {event.end_time && (
            <div style={{
              fontSize: '13px',
              color: '#64748b',
              marginTop: '4px',
            }}>
              {formatDate(event.end_time)}
            </div>
          )}
        </div>

        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}>
            Created
          </div>
          <div style={{
            fontSize: '16px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {formatDate(event.created_at)}
          </div>
          <div style={{
            fontSize: '13px',
            color: '#64748b',
            marginTop: '4px',
          }}>
            {formatDateTime(event.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}

