'use client';

import { useState, useEffect } from 'react';
import type { EventDoc } from '@/shared/types/event-doc';
import { getFileExtension, getFileType, getFilenameFromPath } from '@/shared/utils/file-utils';

interface DocumentListItemProps {
  doc: EventDoc;
  onRemove?: () => void;
  onUpdateName?: (docId: string, newName: string) => Promise<void>;
  isRemoving?: boolean;
  isUpdating?: boolean;
}

// Minimalist SVG icons for file types
function FileIcon({ fileType }: { fileType: string }) {
  const iconStyle = {
    width: '20px',
    height: '20px',
    color: '#64748b',
    flexShrink: 0,
  };

  switch (fileType) {
    case 'pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M10 12h4" />
          <path d="M10 16h4" />
          <path d="M10 8h4" />
        </svg>
      );
    case 'document':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
      );
    case 'image':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case 'spreadsheet':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h8" />
          <path d="M8 9h8" />
        </svg>
      );
    case 'presentation':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
          <rect x="3" y="3" width="18" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      );
    case 'archive':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
          <path d="M21 8v13H3V8" />
          <path d="M1 3h22v5H1z" />
          <path d="M10 12h4" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
  }
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function DocumentListItem({ doc, onRemove, onUpdateName, isRemoving = false, isUpdating = false }: DocumentListItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Use custom name if available, otherwise extract from path
  const displayName = doc.name || getFilenameFromPath(doc.path);
  const [editedName, setEditedName] = useState(displayName);
  const [isSaving, setIsSaving] = useState(false);

  // Sync editedName when doc changes
  useEffect(() => {
    setEditedName(displayName);
  }, [displayName]);

  const extension = getFileExtension(displayName);
  const fileType = getFileType(extension);

  // Auto-save on blur
  const handleNameBlur = async () => {
    if (!onUpdateName || editedName.trim() === displayName || !editedName.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateName(doc.id, editedName.trim());
    } catch (err) {
      console.error('Failed to update document name:', err);
      // Reset to original name on error
      setEditedName(displayName);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Enter key to save
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setEditedName(displayName);
      e.currentTarget.blur();
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showConfirm) {
      onRemove();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowConfirm(false), 3000);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        marginBottom: '8px',
      }}
    >
      <FileIcon fileType={fileType} />
      
      <div style={{ flex: 1, minWidth: 0 }}>
        {onUpdateName ? (
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            disabled={isSaving || isRemoving || isUpdating}
            style={{
              width: '100%',
              padding: '4px 8px',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#0f172a',
              background: isSaving || isRemoving || isUpdating ? '#f8fafc' : '#ffffff',
              boxSizing: 'border-box',
            }}
            title={editedName}
          />
        ) : (
          <div
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#0f172a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={displayName}
          >
            {displayName}
          </div>
        )}
        <div
          style={{
            fontSize: '12px',
            color: '#64748b',
            marginTop: '4px',
          }}
        >
          {extension ? extension.toUpperCase() : 'FILE'} • {new Date(doc.created_at).toLocaleDateString()}
        </div>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={handleRemoveClick}
          disabled={isRemoving || isSaving}
          style={{
            padding: '6px',
            background: showConfirm ? '#dc2626' : 'transparent',
            color: showConfirm ? '#ffffff' : '#dc2626',
            border: showConfirm ? 'none' : '1px solid #dc2626',
            borderRadius: '4px',
            cursor: isRemoving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isRemoving ? 0.6 : 1,
          }}
        onMouseEnter={(e) => {
          if (!isRemoving && !showConfirm) {
            e.currentTarget.style.background = '#fee2e2';
            e.currentTarget.style.color = '#991b1b';
            e.currentTarget.style.borderColor = '#dc2626';
          }
        }}
        onMouseLeave={(e) => {
          if (!isRemoving && !showConfirm) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#dc2626';
            e.currentTarget.style.borderColor = '#dc2626';
          }
        }}
        title={isRemoving ? 'Removing...' : showConfirm ? 'Click to confirm removal' : 'Remove document'}
      >
        {isRemoving ? (
          <span style={{ fontSize: '12px' }}>Removing...</span>
        ) : showConfirm ? (
          <span style={{ fontSize: '12px' }}>Confirm?</span>
        ) : (
          <RemoveIcon />
        )}
        </button>
      )}
    </div>
  );
}

