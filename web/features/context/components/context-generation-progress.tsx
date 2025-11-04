'use client';

interface ContextGenerationProgressProps {
  status: string;
  stage: string;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
}

export function ContextGenerationProgress({
  status,
  stage,
  progress,
}: ContextGenerationProgressProps) {
  const getStageLabel = (stage: string): string => {
    switch (stage) {
      case 'blueprint_generating':
        return 'Generating Blueprint';
      case 'researching':
        return 'Researching';
      case 'building_glossary':
        return 'Building Glossary';
      case 'building_chunks':
        return 'Building Chunks';
      case 'context_complete':
        return 'Complete';
      default:
        return stage;
    }
  };

  const getProgressLabel = (): string => {
    if (stage === 'building_glossary' && progress) {
      return `${progress.current} / ${progress.total} terms`;
    }
    if (stage === 'building_chunks' && progress) {
      return `${progress.current} / ${progress.total} chunks`;
    }
    return '';
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <span style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#0f172a',
        }}>
          {getStageLabel(stage)}
        </span>
        {progress && (
          <span style={{
            fontSize: '14px',
            color: '#64748b',
          }}>
            {getProgressLabel()} ({progress.percentage}%)
          </span>
        )}
      </div>

      {/* Progress bar */}
      {progress ? (
        <div style={{
          width: '100%',
          height: '8px',
          background: '#e2e8f0',
          borderRadius: '4px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.min(progress.percentage, 100)}%`,
            height: '100%',
            background: '#3b82f6',
            borderRadius: '4px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      ) : (
        <div style={{
          width: '100%',
          height: '8px',
          background: '#e2e8f0',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #3b82f6 100%)',
            backgroundSize: '200% 100%',
            animation: 'pulse 2s ease-in-out infinite',
            borderRadius: '4px',
          }} />
        </div>
      )}

      {/* Stage indicators */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
        flexWrap: 'wrap',
      }}>
        {['blueprint_generating', 'researching', 'building_glossary', 'building_chunks', 'context_complete'].map((s, index) => {
          const isActive = stage === s;
          const isCompleted = getStageOrder(stage) > getStageOrder(s);

          return (
            <div
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: isCompleted ? '#dcfce7' : isActive ? '#dbeafe' : '#f1f5f9',
                color: isCompleted ? '#166534' : isActive ? '#1e40af' : '#64748b',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: isActive ? '500' : '400',
              }}
            >
              {isCompleted && '✓ '}
              {getStageLabel(s)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getStageOrder(stage: string): number {
  const order: Record<string, number> = {
    'blueprint_generating': 1,
    'researching': 2,
    'building_glossary': 3,
    'building_chunks': 4,
    'context_complete': 5,
  };
  return order[stage] || 0;
}
