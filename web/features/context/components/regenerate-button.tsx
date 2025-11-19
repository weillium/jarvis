'use client';

import { useState, useEffect } from 'react';
import { useStartOrRegenerateMutation } from '@/shared/hooks/use-mutations';
import { YStack, XStack, Text, Button, Alert } from '@jarvis/ui-core';

interface RegenerateButtonProps {
  eventId: string;
  stage: 'blueprint' | 'research' | 'glossary' | 'chunks';
  onComplete?: () => void;
  isRegenerating?: boolean; // External regeneration status from parent
}

export function RegenerateButton({ eventId, stage, onComplete, isRegenerating: externalIsRegenerating }: RegenerateButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [hasBlueprint, setHasBlueprint] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Mutation hook
  const startOrRegenerateMutation = useStartOrRegenerateMutation(eventId);

  // Use external regeneration status if provided, otherwise use mutation state
  const isCurrentlyRegenerating = externalIsRegenerating !== undefined ? externalIsRegenerating : startOrRegenerateMutation.isPending;

  // Check if blueprint exists
  useEffect(() => {
    async function checkBlueprint() {
      try {
        const res = await fetch(`/api/context/${eventId}/status`);
        const data = await res.json();
        if (data.ok) {
          setHasBlueprint(!!data.blueprint && data.blueprint.status !== null);
        }
      } catch (err) {
        console.error('Failed to check blueprint status:', err);
        setHasBlueprint(false);
      } finally {
        setLoading(false);
      }
    }

    checkBlueprint();
    // Poll every 3 seconds to check for blueprint updates
    const interval = setInterval(checkBlueprint, 3000);
    return () => clearInterval(interval);
  }, [eventId]);

  const handleStartOrRegenerate = () => {
    setError(null);
    
    if (hasBlueprint === null) {
      setError('Loading blueprint status...');
      return;
    }

    startOrRegenerateMutation.mutate({ stage, hasBlueprint }, {
      onSuccess: () => {
        if (onComplete) {
          onComplete();
        }
        // Refresh blueprint status after starting
        if (stage === 'blueprint' && !hasBlueprint) {
          setTimeout(() => {
            fetch(`/api/context/${eventId}/status`)
              .then(r => r.json())
              .then(d => {
                if (d.ok && d.blueprint) {
                  setHasBlueprint(true);
                }
              });
          }, 1000);
        }
      },
      onError: (err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage || `Failed to ${hasBlueprint ? 'regenerate' : 'start'} ${stage}`);
      },
    });
  };

  const getButtonVariant = (): 'primary' | 'outline' => {
    if (loading || isCurrentlyRegenerating || (stage !== 'blueprint' && !hasBlueprint)) {
      return 'outline';
    }
    return 'primary';
  };

  const getButtonLabel = () => {
    if (isCurrentlyRegenerating) {
      if (stage === 'blueprint' && !hasBlueprint) {
        return 'Starting...';
      }
      return 'Regenerating...';
    }
    
    if (loading) {
      return 'Loading...';
    }

    switch (stage) {
      case 'blueprint':
        return hasBlueprint ? 'Regenerate Blueprint' : 'Start Context Generation';
      case 'research':
        return 'Regenerate Research';
      case 'glossary':
        return 'Regenerate Glossary';
      case 'chunks':
        return 'Regenerate Chunks';
      default:
        return 'Regenerate';
    }
  };

  const isDisabled = () => {
    if (isCurrentlyRegenerating || loading) return true;
    // Disable research/glossary/chunks if no blueprint
    if (stage !== 'blueprint' && !hasBlueprint) return true;
    return false;
  };

  return (
    <YStack marginBottom={0}>
      <XStack alignItems="center" gap="$2" marginBottom={error ? '$2' : 0}>
        <Button
          variant={getButtonVariant()}
          size="sm"
          onPress={handleStartOrRegenerate}
          disabled={isDisabled()}
        >
          {getButtonLabel()}
        </Button>
        {isCurrentlyRegenerating && (
          <YStack
            width={16}
            height={16}
            borderWidth={2}
            borderColor="$gray11"
            borderTopColor="transparent"
            borderRadius="$10"
            style={{
              animation: 'spin 0.8s linear infinite',
            }}
            aria-label="Regenerating"
          />
        )}
      </XStack>
      {error && (
        <Alert variant="error" padding="$2 $3">
          <Text fontSize="$2" margin={0}>
            {error}
          </Text>
        </Alert>
      )}
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </YStack>
  );
}

