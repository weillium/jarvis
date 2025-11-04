import { getEventById } from '@/server/actions/event-actions';
import { getAgentByEventId } from '@/server/actions/agent-actions';
import { EventDetail } from '@/features/events/components/event-detail';
import { AgentPlaceholder } from '@/features/events/components/agent-placeholder';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { ContextDatabaseVisualization } from '@/features/events/components/context-database-visualization';
import { GlossaryVisualization } from '@/features/context/components/glossary-visualization';
import { LiveCards } from '@/features/cards/components/live-cards';
import { LiveFacts } from '@/features/facts/components/live-facts';
import Link from 'next/link';

type Props = { 
  params: Promise<{ eventId: string }>;
};

export default async function LiveEventPage({ params }: Props) {
  const { eventId } = await params;
  
  const { data: event, error } = await getEventById(eventId);
  const { data: agent } = await getAgentByEventId(eventId);

  if (error || !event) {
    return (
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '48px 24px',
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#0f172a',
            margin: '0 0 12px 0',
          }}>
            Event Not Found
          </h2>
          <p style={{
            fontSize: '16px',
            color: '#64748b',
            margin: '0 0 24px 0',
          }}>
            {error || 'The event you are looking for does not exist or you do not have access to it.'}
          </p>
          <Link
            href="/events"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: '#1e293b',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '15px',
              fontWeight: '500',
            }}
          >
            Back to Events
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto',
      padding: '24px',
    }}>
      <div style={{
        marginBottom: '24px',
      }}>
        <Link
          href="/events"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#64748b',
            textDecoration: 'none',
            fontSize: '14px',
            marginBottom: '16px',
          }}
        >
          <span>←</span>
          <span>Back to Events</span>
        </Link>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#0f172a',
          margin: 0,
        }}>
          Live Event View
        </h1>
      </div>

      <EventDetail event={event} />
      
      <AgentPlaceholder agent={agent} eventId={eventId} />
      
      {/* Context Generation Panel */}
      <ContextGenerationPanel eventId={eventId} agentStatus={agent?.status || null} />
      
      {/* Context Database Visualization */}
      <ContextDatabaseVisualization eventId={eventId} agentStatus={agent?.status || null} />
      
      {/* Glossary Visualization - Show when context is complete */}
      {agent?.status === 'context_complete' && (
        <div style={{ marginTop: '24px', marginBottom: '24px' }}>
          <GlossaryVisualization eventId={eventId} />
        </div>
      )}
      
      {/* Live Cards Section */}
      <div style={{ marginTop: '32px', marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#0f172a',
            marginBottom: '16px',
          }}
        >
          Live Context Cards
        </h2>
        <LiveCards eventId={eventId} />
      </div>

      {/* Live Facts Section */}
      <div style={{ marginTop: '32px' }}>
        <LiveFacts eventId={eventId} />
      </div>
    </div>
  );
}