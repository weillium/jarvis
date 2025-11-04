'use client';

import { useState, useEffect } from 'react';
import { EventWithStatus } from '@/shared/types/event';
import { format, parseISO } from 'date-fns';
import { EditEventModal } from './edit-event-modal';

interface EventDetailProps {
  event: EventWithStatus;
  onEventUpdate?: (updatedEvent: EventWithStatus) => void;
}

export function EventDetail({ event, onEventUpdate }: EventDetailProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState(event);

  // Update local state when event prop changes
  useEffect(() => {
    setCurrentEvent(event);
  }, [event]);
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
              {currentEvent.title}
            </h1>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: `${getStatusColor(currentEvent.status)}20`,
                color: getStatusColor(currentEvent.status),
              }}
            >
              {getStatusLabel(currentEvent.status)}
            </span>
          </div>
        </div>
        <button
          onClick={() => setIsEditModalOpen(true)}
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
            e.currentTarget.style.borderColor = '#cbd5e1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }}
        >
          Edit
        </button>
      </div>

      {currentEvent.topic && (
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
            {currentEvent.topic}
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
            {formatDateTime(currentEvent.start_time)}
          </div>
          {currentEvent.start_time && (
            <div style={{
              fontSize: '13px',
              color: '#64748b',
              marginTop: '4px',
            }}>
              {formatDate(currentEvent.start_time)}
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
            {formatDateTime(currentEvent.end_time)}
          </div>
          {currentEvent.end_time && (
            <div style={{
              fontSize: '13px',
              color: '#64748b',
              marginTop: '4px',
            }}>
              {formatDate(currentEvent.end_time)}
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
            {formatDate(currentEvent.created_at)}
          </div>
          <div style={{
            fontSize: '13px',
            color: '#64748b',
            marginTop: '4px',
          }}>
            {formatDateTime(currentEvent.created_at)}
          </div>
        </div>
      </div>

      <EditEventModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        event={currentEvent}
        onSuccess={(updatedEvent) => {
          setCurrentEvent(updatedEvent);
          if (onEventUpdate) {
            onEventUpdate(updatedEvent);
          }
        }}
      />
    </div>
  );
}

