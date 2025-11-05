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
import { useState } from 'react';
import { useAgentQuery } from '@/shared/hooks/use-agent-query';
import { useBlueprintQuery } from '@/shared/hooks/use-blueprint-query';

interface LiveEventTabsProps {
  event: EventWithStatus;
  eventId: string;
}

export function LiveEventTabs({ event, eventId }: LiveEventTabsProps) {
  const [approving, setApproving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  
  // Use React Query hooks for agent and blueprint data
  const { data: agentData, refetch: refetchAgent } = useAgentQuery(eventId);
  const { data: blueprint, refetch: refetchBlueprint } = useBlueprintQuery(eventId);
  
  // Get agent info for context generation panel
  const agentInfo = agentData?.agent ?? null;
  
  // Derive state from queries
  const agentStatus = agentData?.agent?.status ?? null;
  const agentStage = agentData?.agent?.stage ?? null;
  const blueprintStatus = blueprint?.status ?? null;
  
  // Can approve when agent status is blueprint_ready AND blueprint status is ready
  const canApprove = agentStatus === 'blueprint_ready' && blueprintStatus === 'ready' && !blueprint?.approved_at;
  
  // Regeneration status tracking (derived from agent stage)
  const isRegeneratingResearch = agentStage === 'regenerating_research';
  const isRegeneratingGlossary = agentStage === 'regenerating_glossary';
  const isRegeneratingChunks = agentStage === 'regenerating_chunks';

  const handleApproveBlueprint = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/context/${eventId}/blueprint`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.ok) {
        // Refetch queries to get updated data
        await Promise.all([refetchAgent(), refetchBlueprint()]);
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

  const handleReset = async () => {
    if (!confirm('Are you sure you want to invalidate all context components? This will require restarting context building.')) {
      return;
    }

    setIsResetting(true);
    setResetError(null);

    try {
      const res = await fetch(`/api/context/${eventId}/reset`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        // Refetch queries to get updated data
        await refetchAgent();
      } else {
        setResetError(data.error || 'Failed to reset context');
      }
    } catch (err) {
      console.error('Failed to reset context:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setResetError(errorMessage || 'Failed to reset context');
    } finally {
      setIsResetting(false);
    }
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
          {/* Context Generation Progress - moved from overview */}
          <div style={{ marginBottom: '24px' }}>
            {resetError && (
              <div style={{
                marginBottom: '16px',
                padding: '8px 12px',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '12px',
              }}>
                {resetError}
              </div>
            )}
            <ContextGenerationPanel 
              eventId={eventId} 
              embedded={true}
              onClearContext={agentInfo && agentInfo.status !== 'idle' ? handleReset : undefined}
              isClearing={isResetting}
            />
          </div>
          
          {/* Divider line */}
          <div style={{
            height: '1px',
            background: '#e2e8f0',
            marginBottom: '24px',
          }} />
          
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginBottom: '16px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
            {canApprove && (
              <button
                onClick={handleApproveBlueprint}
                disabled={approving}
                style={{
                  padding: '10px 16px',
                  background: approving ? '#94a3b8' : '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: approving ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                  opacity: approving ? 0.6 : 1,
                }}
              >
                {approving ? 'Approving...' : 'Approve Blueprint'}
              </button>
            )}
          </div>
          <BlueprintDisplay
            eventId={eventId}
            onApprove={handleApproveBlueprint}
            approving={approving}
            canApprove={false}
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
          <div style={{ marginBottom: '16px' }}>
            <RegenerateButton eventId={eventId} stage="research" isRegenerating={isRegeneratingResearch} />
          </div>
          <ResearchResultsVisualization eventId={eventId} embedded={true} />
        </div>
      ),
    },
    {
      id: 'glossary',
      label: 'Glossary',
      content: (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <RegenerateButton eventId={eventId} stage="glossary" isRegenerating={isRegeneratingGlossary} />
          </div>
          <GlossaryVisualization eventId={eventId} embedded={true} />
        </div>
      ),
    },
    {
      id: 'database',
      label: 'Context Database',
      content: (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <RegenerateButton eventId={eventId} stage="chunks" isRegenerating={isRegeneratingChunks} />
          </div>
          <ContextDatabaseVisualization eventId={eventId} agentStatus={agentStatus} agentStage={agentStage} embedded={true} />
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

