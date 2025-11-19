'use client';

import { EventWithStatus } from '@/shared/types/event';
import { Tabs, SubTabs } from '@jarvis/ui-core';
import { EventDetail } from './event-detail';
import { AgentOverview } from './agent-overview';
import { BlueprintDisplay } from '@/features/context/components/blueprint-display';
import { ResearchResultsVisualization } from '@/features/context/components/research-results-visualization';
import { GlossaryVisualization } from '@/features/context/components/glossary-visualization';
import { ContextDatabaseVisualization } from './context-database-visualization';
import { VersionHistory } from '@/features/context/components/version-history';
import { LiveCards } from '@/features/cards/components/live-cards';
import { LiveFacts } from '@/features/facts/components/live-facts';
import { LiveTranscripts } from '@/features/transcripts/components/live-transcripts';
import { AgentSessions } from './agent-sessions';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';

interface LiveEventTabsProps {
  event: EventWithStatus;
  eventId: string;
}

export function LiveEventTabs({ event, eventId }: LiveEventTabsProps) {
  // Use React Query hooks for agent data
  const { data: agentData } = useAgentQuery(eventId);
  
  // Derive state from queries
  const agentStatus = agentData?.agent?.status ?? null;
  const agentStage = agentData?.agent?.stage ?? null;

  const handleRegenerateBlueprint = () => {
    // BlueprintDisplay handles its own regenerate logic
  };

  // Agent Context subtabs
  const agentSubtabs = [
    {
      id: 'overview',
      label: 'Overview',
      content: <AgentOverview eventId={eventId} />,
    },
    {
      id: 'blueprint',
      label: 'Context Blueprint',
      content: (
        <BlueprintDisplay
          eventId={eventId}
          onRegenerate={handleRegenerateBlueprint}
          embedded={true}
        />
      ),
    },
    {
      id: 'research',
      label: 'Research Results',
      content: (
        <ResearchResultsVisualization eventId={eventId} embedded={true} />
      ),
    },
    {
      id: 'glossary',
      label: 'Glossary',
      content: (
        <GlossaryVisualization eventId={eventId} embedded={true} />
      ),
    },
    {
      id: 'database',
      label: 'Context Database',
      content: (
        <ContextDatabaseVisualization eventId={eventId} agentStatus={agentStatus} agentStage={agentStage} embedded={true} />
      ),
    },
    {
      id: 'versions',
      label: 'Version History',
      content: <VersionHistory eventId={eventId} embedded={true} />,
    },
  ];

  // Main tabs
  const mainTabs = [
    {
      id: 'event',
      label: 'Event Details',
      content: <EventDetail eventId={eventId} event={event} />,
    },
    {
      id: 'agent',
      label: 'Agent Context',
      content: (
        <div>
          <SubTabs tabs={agentSubtabs} defaultTab="overview" />
        </div>
      ),
    },
    {
      id: 'sessions',
      label: 'Agent Sessions',
      content: <AgentSessions eventId={eventId} />,
    },
    {
      id: 'transcripts',
      label: 'Transcripts',
      content: <LiveTranscripts eventId={eventId} />,
    },
    {
      id: 'facts',
      label: 'Key Facts',
      content: <LiveFacts eventId={eventId} />,
    },
    {
      id: 'cards',
      label: 'Context Cards',
      content: <LiveCards eventId={eventId} />,
    },
  ];

  return (
    <Tabs tabs={mainTabs} defaultTab="event" />
  );
}
