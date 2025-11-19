'use client';

interface StageRegenerationControlsProps {
  embedded?: boolean;
  canStartGeneration: boolean;
  canRegenerateBlueprint: boolean;
  canApprove: boolean;
  isRegenerating: boolean;
  regeneratingStage: string | null;
  approving: boolean;
  isContextGenerationRunning: boolean;
  isClearing: boolean;
  statusData: {
    blueprint?: { status: string } | null;
    agent?: { status: string; stage?: string | null } | null;
    hasResearch?: boolean;
    hasGlossary?: boolean;
    hasChunks?: boolean;
  } | null;
  onStartGeneration: () => void;
  onRegenerateBlueprint: () => void;
  onApprove: () => void;
  onRegenerateStage: (stage: 'research' | 'glossary' | 'chunks') => void;
  onClearContext?: () => void;
}

export function StageRegenerationControls({
  embedded = false,
  canStartGeneration,
  canRegenerateBlueprint,
  canApprove,
  isRegenerating,
  regeneratingStage,
  approving,
  isContextGenerationRunning,
  isClearing,
  statusData,
  onStartGeneration,
  onRegenerateBlueprint,
  onApprove,
  onRegenerateStage,
  onClearContext,
}: StageRegenerationControlsProps) {
  return (
    <div style={{
      marginBottom: '20px',
      ...(embedded ? {} : {
        padding: '16px',
        background: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
      }),
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '8px',
      }}>
        {/* Start Context Generation button - show when no blueprint or blueprint is in error */}
        {canStartGeneration && (
          <button
            onClick={onStartGeneration}
            disabled={!!isRegenerating || !!regeneratingStage}
            style={{
              padding: '10px 16px',
              background: (isRegenerating) 
                ? '#94a3b8' 
                : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: (isRegenerating || regeneratingStage) 
                ? 'not-allowed' 
                : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {isRegenerating 
              ? 'Starting...'
              : 'Start Context Generation'}
          </button>
        )}
        
        {/* Regenerate Blueprint button - show when blueprint is ready or approved */}
        {canRegenerateBlueprint && (
          <button
            onClick={onRegenerateBlueprint}
            disabled={!!isRegenerating || !!regeneratingStage || isContextGenerationRunning}
            style={{
              padding: '10px 16px',
              background: (isRegenerating || isContextGenerationRunning) 
                ? '#94a3b8' 
                : '#8b5cf6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: (isRegenerating || regeneratingStage || isContextGenerationRunning) 
                ? 'not-allowed' 
                : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {isRegenerating 
              ? 'Regenerating...'
              : 'Regenerate Blueprint'}
          </button>
        )}
        
        {/* Approve Blueprint button - show when blueprint is ready */}
        {canApprove && (
          <button
            onClick={onApprove}
            disabled={approving}
            style={{
              padding: '10px 16px',
              background: approving 
                ? '#94a3b8' 
                : '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: approving 
                ? 'not-allowed' 
                : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {approving ? 'Approving...' : 'Approve Blueprint'}
          </button>
        )}
        {/* Stage regeneration buttons - only show when blueprint is approved */}
        {statusData?.blueprint?.status === 'approved' && (
          <>
            <button
              onClick={() => onRegenerateStage('research')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                !statusData?.hasResearch ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')
              }
              style={{
                padding: '10px 16px',
                background: (regeneratingStage === 'research' || isContextGenerationRunning || !statusData?.hasResearch || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                  ? '#94a3b8' 
                  : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: (regeneratingStage || isContextGenerationRunning || !statusData?.hasResearch || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                  ? 'not-allowed' 
                  : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {(regeneratingStage === 'research' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                ? 'Regenerating...' 
                : 'Regenerate Research'}
            </button>
            <button
              onClick={() => onRegenerateStage('glossary')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                !statusData?.hasGlossary ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')
              }
              style={{
                padding: '10px 16px',
                background: (regeneratingStage === 'glossary' || isContextGenerationRunning || !statusData?.hasGlossary || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                  ? '#94a3b8' 
                  : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: (regeneratingStage || isContextGenerationRunning || !statusData?.hasGlossary || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                  ? 'not-allowed' 
                  : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {(regeneratingStage === 'glossary' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                ? 'Regenerating...' 
                : 'Regenerate Glossary'}
            </button>
            <button
              onClick={() => onRegenerateStage('chunks')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                !statusData?.hasChunks ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')
              }
              style={{
                padding: '10px 16px',
                background: (regeneratingStage === 'chunks' || isContextGenerationRunning || !statusData?.hasChunks || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                  ? '#94a3b8' 
                  : '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: (regeneratingStage || isContextGenerationRunning || !statusData?.hasChunks || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                  ? 'not-allowed' 
                  : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {(regeneratingStage === 'chunks' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                ? 'Regenerating...' 
                : 'Regenerate Chunks'}
            </button>
          </>
        )}
        {onClearContext && (
          <button
            onClick={onClearContext}
            disabled={isClearing || !!isRegenerating || !!regeneratingStage}
            style={{
              padding: '10px 16px',
              background: (isClearing || isRegenerating || regeneratingStage) 
                ? '#94a3b8' 
                : '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: (isClearing || isRegenerating || regeneratingStage) 
                ? 'not-allowed' 
                : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {isClearing ? 'Clearing...' : 'Clear Context'}
          </button>
        )}
      </div>
    </div>
  );
}

