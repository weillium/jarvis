import Link from 'next/link';

export default function AppDashboard() {
  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      <div style={{
        marginBottom: '32px',
      }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: '700',
          color: '#0f172a',
          margin: '0 0 8px 0',
          letterSpacing: '-0.5px',
        }}>
          Dashboard
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#64748b',
          margin: 0,
        }}>
          Overview of your events and agents
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
        marginBottom: '40px',
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
        }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#64748b',
            margin: '0 0 8px 0',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Active Events
          </h3>
          <div style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#0f172a',
            margin: '0 0 4px 0',
          }}>
            {/* Placeholder: Active events count */}
            --
          </div>
          <Link href="/events" style={{
            fontSize: '14px',
            color: '#1e293b',
            textDecoration: 'none',
            fontWeight: '500',
          }}>
            View all →
          </Link>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
        }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#64748b',
            margin: '0 0 8px 0',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Active Agents
          </h3>
          <div style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#0f172a',
            margin: '0 0 4px 0',
          }}>
            {/* Placeholder: Active agents count */}
            --
          </div>
          <Link href="/agents" style={{
            fontSize: '14px',
            color: '#1e293b',
            textDecoration: 'none',
            fontWeight: '500',
          }}>
            View all →
          </Link>
        </div>

        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
        }}>
          <h3 style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#64748b',
            margin: '0 0 8px 0',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Total Cards Generated
          </h3>
          <div style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#0f172a',
            margin: '0 0 4px 0',
          }}>
            {/* Placeholder: Total cards count */}
            --
          </div>
          <span style={{
            fontSize: '14px',
            color: '#64748b',
          }}>
            All time
          </span>
        </div>
      </div>

      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: '600',
          color: '#0f172a',
          margin: '0 0 16px 0',
        }}>
          Recent Activity
        </h2>
        <div style={{
          color: '#64748b',
          fontSize: '14px',
        }}>
          {/* Placeholder: Recent activity list */}
          No recent activity to display
        </div>
      </div>
    </div>
  );
}
