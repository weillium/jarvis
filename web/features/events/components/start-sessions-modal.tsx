'use client';

interface StartSessionsModalProps {
  isOpen: boolean;
  selection: { transcript: boolean; cards: boolean; facts: boolean };
  onSelectionChange: (next: { transcript: boolean; cards: boolean; facts: boolean }) => void;
  onConfirm: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export function StartSessionsModal({
  isOpen,
  selection,
  onSelectionChange,
  onConfirm,
  onClose,
  isSubmitting,
}: StartSessionsModalProps) {
  if (!isOpen) {
    return null;
  }

  const options: Array<{
    key: 'transcript' | 'cards' | 'facts';
    label: string;
    description: string;
  }> = [
    {
      key: 'transcript',
      label: 'Transcript Agent',
      description: 'Captures live audio and produces the transcript stream.',
    },
    {
      key: 'cards',
      label: 'Cards Agent',
      description: 'Generates realtime cards and summaries from transcript context.',
    },
    {
      key: 'facts',
      label: 'Facts Agent',
      description: 'Maintains the structured facts store for downstream consumption.',
    },
  ];

  const hasSelection = selection.transcript || selection.cards || selection.facts;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '600px',
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#0f172a',
              margin: 0,
            }}
          >
            Start Agent Sessions
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              color: '#64748b',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '24px' }}>
          <p
            style={{
              fontSize: '14px',
              color: '#64748b',
              marginBottom: '20px',
              margin: '0 0 20px 0',
            }}
          >
            Select which agent sessions you want to start:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {options.map((option) => (
              <label
                key={option.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '16px',
                  border: `2px solid ${selection[option.key] ? '#3b82f6' : '#e2e8f0'}`,
                  borderRadius: '8px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  background: selection[option.key] ? '#eff6ff' : '#ffffff',
                  transition: 'all 0.2s',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = selection[option.key] ? '#2563eb' : '#cbd5e1';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = selection[option.key] ? '#3b82f6' : '#e2e8f0';
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selection[option.key]}
                  onChange={(e) => {
                    if (!isSubmitting) {
                      onSelectionChange({
                        ...selection,
                        [option.key]: e.target.checked,
                      });
                    }
                  }}
                  disabled={isSubmitting}
                  style={{
                    marginTop: '2px',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#0f172a',
                      marginBottom: '4px',
                    }}
                  >
                    {option.label}
                  </div>
                  <div
                    style={{
                      fontSize: '14px',
                      color: '#64748b',
                    }}
                  >
                    {option.description}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '500',
                color: '#374151',
                background: '#ffffff',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting || !hasSelection}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '500',
                color: '#ffffff',
                background: isSubmitting || !hasSelection ? '#94a3b8' : '#3b82f6',
                cursor: isSubmitting || !hasSelection ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && hasSelection) {
                  e.currentTarget.style.background = '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting && hasSelection) {
                  e.currentTarget.style.background = '#3b82f6';
                }
              }}
            >
              {isSubmitting ? 'Starting…' : 'Start Selected Agents'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

