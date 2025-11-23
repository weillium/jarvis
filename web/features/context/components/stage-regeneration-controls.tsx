'use client';

import { YStack, XStack, Button, Card } from '@jarvis/ui-core';

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
  if (embedded) {
    return (
      <YStack marginBottom="$5" gap="$2">
      <XStack
        flexWrap="wrap"
        gap="$2"
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        {/* Start Context Generation button - show when no blueprint or blueprint is in error */}
        {canStartGeneration && (
          <Button
            variant="primary"
            size="sm"
            onClick={onStartGeneration}
            disabled={!!isRegenerating || !!regeneratingStage}
            backgroundColor={isRegenerating ? '$gray5' : '$blue6'}
          >
            {isRegenerating ? 'Starting...' : 'Start Context Generation'}
          </Button>
        )}
        
        {/* Regenerate Blueprint button - show when blueprint is ready or approved */}
        {canRegenerateBlueprint && (
          <Button
            variant="primary"
            size="sm"
            onClick={onRegenerateBlueprint}
            disabled={!!isRegenerating || !!regeneratingStage || isContextGenerationRunning}
            backgroundColor={(isRegenerating || isContextGenerationRunning) ? '$gray5' : '$purple6'}
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate Blueprint'}
          </Button>
        )}
        
        {/* Approve Blueprint button - show when blueprint is ready */}
        {canApprove && (
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
            disabled={approving}
            backgroundColor={approving ? '$gray5' : '$green11'}
          >
            {approving ? 'Approving...' : 'Approve Blueprint'}
          </Button>
        )}
        {/* Stage regeneration buttons - only show when blueprint is approved */}
        {statusData?.blueprint?.status === 'approved' && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRegenerateStage('research')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                !statusData?.hasResearch ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')
              }
              backgroundColor={
                (regeneratingStage === 'research' || isContextGenerationRunning || !statusData?.hasResearch || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research'))
                  ? '$gray5'
                  : '$blue6'
              }
            >
              {(regeneratingStage === 'research' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                ? 'Regenerating...' 
                : 'Regenerate Research'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRegenerateStage('glossary')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                !statusData?.hasGlossary ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')
              }
              backgroundColor={
                (regeneratingStage === 'glossary' || isContextGenerationRunning || !statusData?.hasGlossary || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary'))
                  ? '$gray5'
                  : '$blue6'
              }
            >
              {(regeneratingStage === 'glossary' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                ? 'Regenerating...' 
                : 'Regenerate Glossary'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRegenerateStage('chunks')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')
              }
              backgroundColor={
                (regeneratingStage === 'chunks' || isContextGenerationRunning || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks'))
                  ? '$gray5'
                  : '$blue6'
              }
            >
              {(regeneratingStage === 'chunks' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                ? 'Regenerating...' 
                : 'Regenerate Chunks'}
            </Button>
          </>
        )}
        {onClearContext && (
          <Button
            variant="primary"
            size="sm"
            onClick={onClearContext}
            disabled={isClearing || !!isRegenerating || !!regeneratingStage}
            backgroundColor={(isClearing || isRegenerating || regeneratingStage) ? '$gray5' : '$red11'}
          >
            {isClearing ? 'Clearing...' : 'Clear Context'}
          </Button>
        )}
      </XStack>
      </YStack>
    );
  }

  return (
    <Card variant="outlined" backgroundColor="$gray1" padding="$4" marginBottom="$5">
      <XStack
        flexWrap="wrap"
        gap="$2"
        $sm={{ flexDirection: 'column' }}
        $md={{ flexDirection: 'row' }}
      >
        {/* Start Context Generation button - show when no blueprint or blueprint is in error */}
        {canStartGeneration && (
          <Button
            variant="primary"
            size="sm"
            onClick={onStartGeneration}
            disabled={!!isRegenerating || !!regeneratingStage}
            backgroundColor={isRegenerating ? '$gray5' : '$blue6'}
          >
            {isRegenerating ? 'Starting...' : 'Start Context Generation'}
          </Button>
        )}
        
        {/* Regenerate Blueprint button - show when blueprint is ready or approved */}
        {canRegenerateBlueprint && (
          <Button
            variant="primary"
            size="sm"
            onClick={onRegenerateBlueprint}
            disabled={!!isRegenerating || !!regeneratingStage || isContextGenerationRunning}
            backgroundColor={(isRegenerating || isContextGenerationRunning) ? '$gray5' : '$purple6'}
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate Blueprint'}
          </Button>
        )}
        
        {/* Approve Blueprint button - show when blueprint is ready */}
        {canApprove && (
          <Button
            variant="primary"
            size="sm"
            onClick={onApprove}
            disabled={approving}
            backgroundColor={approving ? '$gray5' : '$green11'}
          >
            {approving ? 'Approving...' : 'Approve Blueprint'}
          </Button>
        )}
        {/* Stage regeneration buttons - only show when blueprint is approved */}
        {statusData?.blueprint?.status === 'approved' && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRegenerateStage('research')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                !statusData?.hasResearch ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')
              }
              backgroundColor={
                (regeneratingStage === 'research' || isContextGenerationRunning || !statusData?.hasResearch || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research'))
                  ? '$gray5'
                  : '$blue6'
              }
            >
              {(regeneratingStage === 'research' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_research')) 
                ? 'Regenerating...' 
                : 'Regenerate Research'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRegenerateStage('glossary')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                !statusData?.hasGlossary ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')
              }
              backgroundColor={
                (regeneratingStage === 'glossary' || isContextGenerationRunning || !statusData?.hasGlossary || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary'))
                  ? '$gray5'
                  : '$blue6'
              }
            >
              {(regeneratingStage === 'glossary' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_glossary')) 
                ? 'Regenerating...' 
                : 'Regenerate Glossary'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onRegenerateStage('chunks')}
              disabled={
                !!regeneratingStage || 
                isContextGenerationRunning ||
                (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')
              }
              backgroundColor={
                (regeneratingStage === 'chunks' || isContextGenerationRunning || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks'))
                  ? '$gray5'
                  : '$blue6'
              }
            >
              {(regeneratingStage === 'chunks' || (statusData?.agent?.status === 'idle' && statusData?.agent?.stage === 'regenerating_chunks')) 
                ? 'Regenerating...' 
                : 'Regenerate Chunks'}
            </Button>
          </>
        )}
        {onClearContext && (
          <Button
            variant="primary"
            size="sm"
            onClick={onClearContext}
            disabled={isClearing || !!isRegenerating || !!regeneratingStage}
            backgroundColor={(isClearing || isRegenerating || regeneratingStage) ? '$gray5' : '$red11'}
          >
            {isClearing ? 'Clearing...' : 'Clear Context'}
          </Button>
        )}
      </XStack>
    </Card>
  );
}

