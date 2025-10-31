export default function AgentsIndex() {
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
            Agents
          </h1>
          <p style={{
            fontSize: '18px',
            color: '#64748b',
            margin: 0,
          }}>
            Manage your AI context agents
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
          {/* Placeholder: Create agent function */}
          Create Agent
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
            placeholder="Search agents..."
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
            <option>Prepping</option>
            <option>Ready</option>
            <option>Running</option>
            <option>Ended</option>
          </select>
        </div>

        <div style={{
          padding: '24px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}>
            {/* Placeholder: Agent cards */}
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '20px',
                background: '#ffffff',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '12px',
                }}>
                  <div>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: '#0f172a',
                      margin: '0 0 4px 0',
                    }}>
                      {/* Placeholder: Agent name */}
                      Agent {i}
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: '#64748b',
                      margin: 0,
                    }}>
                      {/* Placeholder: Event name */}
                      Event Name Placeholder
                    </p>
                  </div>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    background: '#f1f5f9',
                    color: '#475569',
                  }}>
                    {/* Placeholder: Agent status */}
                    Ready
                  </span>
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#64748b',
                  marginBottom: '16px',
                }}>
                  {/* Placeholder: Agent description */}
                  Context agent for event processing...
                </div>
                <div style={{
                  display: 'flex',
                  gap: '8px',
                }}>
                  <button style={{
                    flex: 1,
                    padding: '8px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}>
                    View Details
                  </button>
                  <button style={{
                    padding: '8px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}>
                    ⋮
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

