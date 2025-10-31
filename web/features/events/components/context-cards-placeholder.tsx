'use client';

export function ContextCardsPlaceholder() {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '48px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        marginBottom: '16px',
      }}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            margin: '0 auto',
            color: '#cbd5e1',
          }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </div>
      <h3 style={{
        fontSize: '18px',
        fontWeight: '600',
        color: '#374151',
        margin: '0 0 8px 0',
      }}>
        Live Context Cards Feed
      </h3>
      <p style={{
        fontSize: '14px',
        color: '#64748b',
        margin: 0,
      }}>
        Context cards will appear here in real-time during the event
      </p>
    </div>
  );
}

