'use client';

import { useState } from 'react';

interface TestTranscriptModalProps {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
  onSend: (text: string, speaker: string) => Promise<void>;
}

export function TestTranscriptModal({
  eventId,
  isOpen,
  onClose,
  onSend,
}: TestTranscriptModalProps) {
  const [text, setText] = useState('');
  const [speaker, setSpeaker] = useState('Test User');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Transcript text is required');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await onSend(text.trim(), speaker.trim() || 'Test User');
      setText('');
      setSpeaker('Test User');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to send test transcript');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (!isSending) {
      setText('');
      setSpeaker('Test User');
      setError(null);
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={handleClose}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        width: '90%',
        maxWidth: '600px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#0f172a',
            margin: 0,
          }}>
            Send Test Transcript
          </h3>
          <button
            onClick={handleClose}
            disabled={isSending}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              color: '#64748b',
              cursor: isSending ? 'not-allowed' : 'pointer',
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
            }}>
              Speaker Name
            </label>
            <input
              type="text"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              placeholder="Test User"
              disabled={isSending}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#374151',
                background: isSending ? '#f3f4f6' : '#ffffff',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
            }}>
              Transcript Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter test transcript text here..."
              disabled={isSending}
              rows={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#374151',
                background: isSending ? '#f3f4f6' : '#ffffff',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px',
              marginBottom: '16px',
              background: '#fef2f2',
              borderRadius: '6px',
              border: '1px solid #fecaca',
              fontSize: '12px',
              color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSending}
              style={{
                padding: '10px 20px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                background: '#ffffff',
                cursor: isSending ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isSending) {
                  e.currentTarget.style.background = '#f8fafc';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSending) {
                  e.currentTarget.style.background = '#ffffff';
                }
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || !text.trim()}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#ffffff',
                background: isSending || !text.trim() ? '#cbd5e1' : '#3b82f6',
                cursor: isSending || !text.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isSending && text.trim()) {
                  e.currentTarget.style.background = '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSending && text.trim()) {
                  e.currentTarget.style.background = '#3b82f6';
                }
              }}
            >
              {isSending ? 'Sending...' : 'Send Transcript'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

