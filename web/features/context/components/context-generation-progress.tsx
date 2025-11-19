'use client';

import { YStack, XStack, Text } from '@jarvis/ui-core';

interface ContextGenerationProgressProps {
  status: string;
  stage: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
  blueprintStatus?: string | null;
}

export function ContextGenerationProgress({
  status,
  stage,
  progress,
  blueprintStatus,
}: ContextGenerationProgressProps) {
  const getStageLabel = (stage: string, blueprintStatus?: string | null): string => {
    switch (stage) {
      case 'idle':
        return 'Ready to Begin Context Building';
      case 'blueprint':
      case 'blueprint_generating':
        // Show different label based on blueprint status
        if (blueprintStatus === 'ready') {
          return 'Blueprint Ready';
        }
        if (blueprintStatus === 'approved') {
          return 'Blueprint Approved';
        }
        if (blueprintStatus === 'error') {
          return 'Blueprint Error';
        }
        // Default to generating if no blueprint or blueprint is generating
        return 'Generating Blueprint';
      case 'researching':
        return 'Researching';
      case 'regenerating_research':
        return 'Regenerating Research';
      case 'building_glossary':
        return 'Building Glossary';
      case 'regenerating_glossary':
        return 'Regenerating Glossary';
      case 'building_chunks':
        return 'Building Chunks';
      case 'regenerating_chunks':
        return 'Regenerating Chunks';
      case 'context_complete':
        return 'Context Complete';
      default:
        // Capitalize first letter of unknown stages
        return stage.charAt(0).toUpperCase() + stage.slice(1).replace(/_/g, ' ');
    }
  };

  const getProgressLabel = (): string => {
    if ((stage === 'researching' || stage === 'regenerating_research') && progress) {
      return `${progress.current} / ${progress.total} Queries`;
    }
    if ((stage === 'building_glossary' || stage === 'regenerating_glossary') && progress) {
      return `${progress.current} / ${progress.total} Terms`;
    }
    if ((stage === 'building_chunks' || stage === 'regenerating_chunks') && progress) {
      return `${progress.current} / ${progress.total} Chunks`;
    }
    return '';
  };

  return (
    <YStack>
      <XStack
        justifyContent="space-between"
        alignItems="center"
        marginBottom="$2"
      >
        <Text fontSize="$3" fontWeight="500" color="$color" margin={0}>
          {getStageLabel(stage, blueprintStatus)}
        </Text>
        {progress && (
          <Text fontSize="$3" color="$gray11" margin={0}>
            {getProgressLabel()} ({progress.percentage}%)
          </Text>
        )}
      </XStack>

      {/* Progress bar */}
      {progress ? (
        <YStack
          width="100%"
          height={8}
          backgroundColor="$gray3"
          borderRadius="$1"
          overflow="hidden"
        >
          <YStack
            width={`${Math.min(progress.percentage, 100)}%`}
            height="100%"
            backgroundColor="$blue6"
            borderRadius="$1"
            style={{
              transition: 'width 0.3s ease',
            }}
          />
        </YStack>
      ) : (
        <YStack
          width="100%"
          height={8}
          backgroundColor="$gray3"
          borderRadius="$1"
          overflow="hidden"
          position="relative"
        >
          <YStack
            width="100%"
            height="100%"
            backgroundColor="$blue6"
            borderRadius="$1"
            style={{
              background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #3b82f6 100%)',
              backgroundSize: '200% 100%',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        </YStack>
      )}

      {/* Stage indicators */}
      <XStack
        gap="$2"
        marginTop="$4"
        flexWrap="wrap"
      >
        {['blueprint_generating', 'researching', 'building_glossary', 'building_chunks', 'context_complete'].map((s) => {
          // Handle both 'blueprint' and 'blueprint_generating' as the same stage
          // Handle regeneration stages as the same as their non-regeneration counterparts
          const isActive = stage === s || 
            (stage === 'blueprint' && s === 'blueprint_generating') ||
            (stage === 'regenerating_research' && s === 'researching') ||
            (stage === 'regenerating_glossary' && s === 'building_glossary') ||
            (stage === 'regenerating_chunks' && s === 'building_chunks');
          const isCompleted = getStageOrder(stage) > getStageOrder(s);

          return (
            <XStack
              key={s}
              alignItems="center"
              gap="$1"
              padding="$1 $2"
              backgroundColor={
                isCompleted ? '$green2' : isActive ? '$blue2' : '$gray2'
              }
              borderRadius="$2"
            >
              <Text
                fontSize="$2"
                fontWeight={isActive ? '500' : '400'}
                color={
                  isCompleted ? '$green11' : isActive ? '$blue11' : '$gray11'
                }
                margin={0}
              >
                {isCompleted && '✓ '}
                {getStageLabel(s)}
              </Text>
            </XStack>
          );
        })}
      </XStack>
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
      `}</style>
    </YStack>
  );
}

function getStageOrder(stage: string): number {
  const order: Record<string, number> = {
    'blueprint': 1,
    'blueprint_generating': 1,
    'researching': 2,
    'regenerating_research': 2,
    'building_glossary': 3,
    'regenerating_glossary': 3,
    'building_chunks': 4,
    'regenerating_chunks': 4,
    'context_complete': 5,
  };
  return order[stage] || 0;
}
