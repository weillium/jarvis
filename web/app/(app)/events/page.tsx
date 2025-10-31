import Link from 'next/link';

export default function EventsIndex() {
  return (
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
        <button style={{
          background: '#1e293b',
          color: '#ffffff',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}>
          {/* Placeholder: Create event function */}
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
            style={{
              flex: 1,
              padding: '10px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '15px',
            }}
          />
          <select style={{
            padding: '10px 16px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '15px',
            background: '#ffffff',
          }}>
            <option>All Status</option>
            {/* Placeholder: Filter options */}
            <option>Live</option>
            <option>Scheduled</option>
            <option>Ended</option>
          </select>
        </div>

        <div style={{
          padding: '24px',
        }}>
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: '#64748b',
          }}>
            {/* Placeholder: Events list */}
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
              Create your first event to get started
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
