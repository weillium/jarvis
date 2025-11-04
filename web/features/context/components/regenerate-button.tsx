'use client';

import { useState, useEffect } from 'react';

interface RegenerateButtonProps {
  eventId: string;
  stage: 'blueprint' | 'research' | 'glossary' | 'chunks';
  onComplete?: () => void;
  isRegenerating?: boolean; // External regeneration status from parent
}

export function RegenerateButton({ eventId, stage, onComplete, isRegenerating: externalIsRegenerating }: RegenerateButtonProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBlueprint, setHasBlueprint] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Use external regeneration status if provided, otherwise use internal state
  const isCurrentlyRegenerating = externalIsRegenerating !== undefined ? externalIsRegenerating : isRegenerating;

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

  const handleStartOrRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);

    try {
      let endpoint = '';
      if (stage === 'blueprint') {
        // If no blueprint, start generation; otherwise regenerate
        endpoint = hasBlueprint 
          ? `/api/context/${eventId}/blueprint/regenerate`
          : `/api/context/${eventId}/start`;
      } else {
        endpoint = `/api/context/${eventId}/regenerate?stage=${stage}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.ok) {
        if (onComplete) {
          onComplete();
        }
        // Refresh blueprint status after starting
        if (stage === 'blueprint' && !hasBlueprint) {
          setTimeout(() => {
            const checkRes = fetch(`/api/context/${eventId}/status`);
            checkRes.then(r => r.json()).then(d => {
              if (d.ok && d.blueprint) {
                setHasBlueprint(true);
              }
            });
          }, 1000);
        }
      } else {
        setError(data.error || `Failed to ${hasBlueprint ? 'regenerate' : 'start'} ${stage}`);
      }
    } catch (err) {
      console.error(`Failed to ${hasBlueprint ? 'regenerate' : 'start'} ${stage}:`, err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || `Failed to ${hasBlueprint ? 'regenerate' : 'start'} ${stage}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const getButtonColor = () => {
    if (loading) return '#94a3b8';
    
    // Gray out if regenerating (from external status or internal state)
    if (isCurrentlyRegenerating) {
      return '#94a3b8';
    }
    
    // Gray out if no blueprint and not blueprint stage
    if (stage !== 'blueprint' && !hasBlueprint) {
      return '#94a3b8';
    }

    switch (stage) {
      case 'blueprint':
        return hasBlueprint ? '#8b5cf6' : '#3b82f6';
      case 'research':
      case 'glossary':
      case 'chunks':
        return '#3b82f6';
      default:
        return '#3b82f6';
    }
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
    <div style={{ marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: error ? '8px' : '0' }}>
        <button
          onClick={handleStartOrRegenerate}
          disabled={isDisabled()}
          style={{
            padding: '10px 16px',
            background: getButtonColor(),
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: isDisabled() ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            opacity: isDisabled() ? 0.6 : 1,
          }}
        >
          {getButtonLabel()}
        </button>
        {isCurrentlyRegenerating && (
          <span
            style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              border: '2px solid #64748b',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
            aria-label="Regenerating"
          />
        )}
      </div>
      {error && (
        <div style={{
          padding: '8px 12px',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#991b1b',
          fontSize: '12px',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

