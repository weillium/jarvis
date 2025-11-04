'use client';

import { useState } from 'react';
import { CreateEventModal } from '@/features/events/components/create-event-modal';
import { EventsList } from '@/features/events/components/events-list';

export default function EventsIndex() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'ended'>('all');

  return (
    <>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
        }}>
          <div>
            <h1 style={{
              fontSize: '36px',
              fontWeight: '700',
              color: '#0f172a',
              margin: '0 0 8px 0',
              letterSpacing: '-0.5px',
            }}>
              Events
            </h1>
            <p style={{
              fontSize: '18px',
              color: '#64748b',
              margin: 0,
            }}>
              Manage and monitor your academic events
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              background: '#1e293b',
              color: '#ffffff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#334155';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#1e293b';
            }}
          >
            Create Event
          </button>
        </div>

      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '15px',
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'scheduled' | 'live' | 'ended')}
            style={{
              padding: '10px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '15px',
              background: '#ffffff',
            }}
          >
            <option value="all">All Status</option>
            <option value="live">Live</option>
            <option value="scheduled">Scheduled</option>
            <option value="ended">Ended</option>
          </select>
        </div>

        <div style={{
          padding: '24px',
        }}>
          <EventsList searchQuery={searchQuery} statusFilter={statusFilter} />
        </div>
      </div>
    </div>
      <CreateEventModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          // Trigger a page refresh to show new events
          window.location.reload();
        }}
      />
    </>
  );
}
