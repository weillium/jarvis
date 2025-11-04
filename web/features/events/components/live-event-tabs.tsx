'use client';

import { EventWithStatus } from '@/shared/types/event';
import { Tabs, SubTabs } from '@/shared/ui/tabs';
import { EventDetail } from './event-detail';
import { AgentOverview } from './agent-overview';
import { ContextGenerationPanel } from '@/features/context/components/context-generation-panel';
import { BlueprintDisplay } from '@/features/context/components/blueprint-display';
import { ResearchResultsVisualization } from '@/features/context/components/research-results-visualization';
import { GlossaryVisualization } from '@/features/context/components/glossary-visualization';
import { ContextDatabaseVisualization } from './context-database-visualization';
import { VersionHistory } from '@/features/context/components/version-history';
import { RegenerateButton } from '@/features/context/components/regenerate-button';
import { LiveCards } from '@/features/cards/components/live-cards';
import { LiveFacts } from '@/features/facts/components/live-facts';
import { useState, useEffect } from 'react';

interface LiveEventTabsProps {
  event: EventWithStatus;
  eventId: string;
}

export function LiveEventTabs({ event, eventId }: LiveEventTabsProps) {
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [blueprintStatus, setBlueprintStatus] = useState<string | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [approving, setApproving] = useState(false);

  // Fetch agent status for context generation panel
  useEffect(() => {
    async function fetchAgentStatus() {
      try {
        const res = await fetch(`/api/agent/${eventId}`);
        const data = await res.json();
        if (data.ok && data.agent) {
          setAgentStatus(data.agent.status);
        }
      } catch (err) {
        console.error('Failed to fetch agent status:', err);
      }
    }

    fetchAgentStatus();
    const interval = setInterval(fetchAgentStatus, 3000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Fetch blueprint status
  useEffect(() => {
    async function fetchBlueprintStatus() {
      try {
        const res = await fetch(`/api/context/${eventId}/status`);
        const data = await res.json();
        if (data.ok) {
          setBlueprintStatus(data.blueprint?.status || null);
          setCanApprove(data.blueprint?.status === 'ready' && !data.blueprint?.approved_at);
        }
      } catch (err) {
        console.error('Failed to fetch blueprint status:', err);
      }
    }

    fetchBlueprintStatus();
    const interval = setInterval(fetchBlueprintStatus, 3000);
    return () => clearInterval(interval);
  }, [eventId]);

  const handleApproveBlueprint = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/context/${eventId}/blueprint`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        setBlueprintStatus('approved');
        setCanApprove(false);
        // Refresh agent status
        const agentRes = await fetch(`/api/agent/${eventId}`);
        const agentData = await agentRes.json();
        if (agentData.ok && agentData.agent) {
          setAgentStatus(agentData.agent.status);
        }
      }
    } catch (err) {
      console.error('Failed to approve blueprint:', err);
    } finally {
      setApproving(false);
    }
  };

  const handleRegenerateBlueprint = () => {
    // BlueprintDisplay handles its own regenerate logic
  };

  // Agent Information subtabs
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
        <div>
          <RegenerateButton eventId={eventId} stage="blueprint" />
          <BlueprintDisplay
            eventId={eventId}
            onApprove={handleApproveBlueprint}
            approving={approving}
            canApprove={canApprove}
            onRegenerate={handleRegenerateBlueprint}
            embedded={true}
          />
        </div>
      ),
    },
    {
      id: 'research',
      label: 'Research Results',
      content: (
        <div>
          <RegenerateButton eventId={eventId} stage="research" />
          <ResearchResultsVisualization eventId={eventId} embedded={true} />
        </div>
      ),
    },
    {
      id: 'glossary',
      label: 'Glossary',
      content: (
        <div>
          <RegenerateButton eventId={eventId} stage="glossary" />
          <GlossaryVisualization eventId={eventId} embedded={true} />
        </div>
      ),
    },
    {
      id: 'database',
      label: 'Context Database',
      content: (
        <div>
          <RegenerateButton eventId={eventId} stage="chunks" />
          <ContextDatabaseVisualization eventId={eventId} agentStatus={agentStatus} embedded={true} />
        </div>
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
      content: <EventDetail event={event} />,
    },
    {
      id: 'agent',
      label: 'Agent Information',
      content: (
        <div>
          <SubTabs tabs={agentSubtabs} defaultTab="overview" />
        </div>
      ),
    },
    {
      id: 'cards',
      label: 'Live Context Cards',
      content: <LiveCards eventId={eventId} />,
    },
    {
      id: 'facts',
      label: 'Key Facts',
      content: <LiveFacts eventId={eventId} />,
    },
  ];

  return (
    <div>
      <Tabs tabs={mainTabs} defaultTab="event" />
    </div>
  );
}

