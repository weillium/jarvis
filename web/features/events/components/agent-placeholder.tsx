'use client';

import { Agent } from '@/shared/types/agent';

interface AgentPlaceholderProps {
  agent: Agent | null;
}

export function AgentPlaceholder({ agent }: AgentPlaceholderProps) {
  const getStatusColor = (status: Agent['status']): string => {
    switch (status) {
      case 'ready':
        return '#10b981'; // green
      case 'running':
        return '#3b82f6'; // blue
      case 'prepping':
        return '#f59e0b'; // amber
      case 'ended':
        return '#6b7280'; // gray
      case 'error':
        return '#ef4444'; // red
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: Agent['status']): string => {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'running':
        return 'Running';
      case 'prepping':
        return 'Prepping';
      case 'ended':
        return 'Ended';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  if (!agent) {
    return (
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '32px 24px',
        marginBottom: '24px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}>
            🤖
          </div>
          <div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: '0 0 4px 0',
            }}>
              Agent
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#64748b',
              margin: 0,
            }}>
              No agent associated with this event
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '32px 24px',
      marginBottom: '24px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
        }}>
          🤖
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 8px 0',
          }}>
            Agent
          </h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: `${getStatusColor(agent.status)}20`,
                color: getStatusColor(agent.status),
              }}
            >
              {getStatusLabel(agent.status)}
            </span>
            <span style={{
              fontSize: '13px',
              color: '#64748b',
            }}>
              Model: {agent.model}
            </span>
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        paddingTop: '16px',
        borderTop: '1px solid #e2e8f0',
      }}>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Agent ID
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#0f172a',
            fontFamily: 'monospace',
          }}>
            {agent.id.substring(0, 8)}...
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Status
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: getStatusColor(agent.status),
          }}>
            {getStatusLabel(agent.status)}
          </div>
        </div>
        <div>
          <div style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '6px',
          }}>
            Model
          </div>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#0f172a',
          }}>
            {agent.model}
          </div>
        </div>
      </div>
    </div>
  );
}

