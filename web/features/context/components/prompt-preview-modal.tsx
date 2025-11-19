'use client';

interface PromptPreviewModalProps {
  isOpen: boolean;
  promptPreview: {
    system: string;
    user: string;
    event: {
      title: string;
      topic: string;
      hasDocuments: boolean;
      documentCount: number;
    };
  } | null;
  isRegenerating: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function PromptPreviewModal({
  isOpen,
  promptPreview,
  isRegenerating,
  onClose,
  onConfirm,
}: PromptPreviewModalProps) {
  if (!isOpen || !promptPreview) {
    return null;
  }

  return (
    <div style={{
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
      padding: '20px',
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '900px',
        maxHeight: '90vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }}>
        <h2 style={{
          margin: '0 0 20px 0',
          fontSize: '20px',
          fontWeight: '600',
          color: '#1e293b',
        }}>
          Confirm Prompt Before Generation
        </h2>

        {/* Event Info */}
        <div style={{
          background: '#f1f5f9',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
            Event Information
          </h3>
          <p style={{ margin: '4px 0', fontSize: '14px', color: '#64748b' }}>
            <strong>Title:</strong> {promptPreview.event.title}
          </p>
          <p style={{ margin: '4px 0', fontSize: '14px', color: '#64748b' }}>
            <strong>Topic:</strong> {promptPreview.event.topic}
          </p>
          {promptPreview.event.hasDocuments && (
            <p style={{ margin: '4px 0', fontSize: '14px', color: '#64748b' }}>
              <strong>Documents:</strong> {promptPreview.event.documentCount} document(s) available
            </p>
          )}
        </div>

        {/* User Prompt - System prompt is embedded and doesn't need to be shown separately */}
        <div style={{ marginBottom: '20px', flex: 1, overflow: 'auto' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
            User Prompt
          </h3>
          <pre style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '12px',
            color: '#334155',
            overflow: 'auto',
            maxHeight: '300px',
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
          }}>
            {promptPreview.user}
          </pre>
        </div>

        {/* Modal Actions */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '16px',
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#ffffff',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRegenerating}
            style={{
              background: isRegenerating ? '#94a3b8' : '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: isRegenerating ? 'not-allowed' : 'pointer',
            }}
          >
            {isRegenerating ? 'Starting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

