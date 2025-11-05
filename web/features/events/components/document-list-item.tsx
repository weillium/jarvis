'use client';

import { useState, useEffect } from 'react';
import type { EventDoc } from '@/shared/types/event-doc';
import { getFileExtension, getFileType, getFileIcon, getFilenameFromPath } from '@/shared/utils/file-utils';

interface DocumentListItemProps {
  doc: EventDoc;
  onRemove: () => void;
  onUpdateName?: (docId: string, newName: string) => Promise<void>;
  isRemoving?: boolean;
  isUpdating?: boolean;
}

export function DocumentListItem({ doc, onRemove, onUpdateName, isRemoving = false, isUpdating = false }: DocumentListItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Use custom name if available, otherwise extract from path
  const displayName = doc.name || getFilenameFromPath(doc.path);
  const [editedName, setEditedName] = useState(displayName);
  const [isSaving, setIsSaving] = useState(false);

  // Sync editedName when doc changes
  useEffect(() => {
    if (!isEditing) {
      setEditedName(displayName);
    }
  }, [displayName, isEditing]);
  const extension = getFileExtension(displayName);
  const fileType = getFileType(extension);
  const icon = getFileIcon(fileType);

  const handleSaveName = async () => {
    if (!onUpdateName || editedName.trim() === displayName) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateName(doc.id, editedName.trim());
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update document name:', err);
      // Reset to original name on error
      setEditedName(displayName);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedName(displayName);
    setIsEditing(false);
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
        justifyContent: 'space-between',
        padding: '12px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        marginBottom: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '24px', lineHeight: '1', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName();
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={isSaving || !editedName.trim()}
                style={{
                  padding: '4px 8px',
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: isSaving || !editedName.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSaving || !editedName.trim() ? 0.6 : 1,
                }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                style={{
                  padding: '4px 8px',
                  background: '#e2e8f0',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#0f172a',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
                title={displayName}
              >
                {displayName}
              </div>
              {onUpdateName && (
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isRemoving || isUpdating}
                  style={{
                    padding: '4px 8px',
                    background: 'transparent',
                    color: '#64748b',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: isRemoving || isUpdating ? 'not-allowed' : 'pointer',
                    opacity: isRemoving || isUpdating ? 0.6 : 1,
                  }}
                  title="Edit name"
                >
                  ✏️
                </button>
              )}
            </div>
          )}
          <div
            style={{
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            {extension ? extension.toUpperCase() : 'FILE'} • Uploaded {new Date(doc.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      <button
        onClick={handleRemoveClick}
        disabled={isRemoving || isEditing}
        style={{
          padding: '6px 12px',
          background: showConfirm ? '#dc2626' : '#fee2e2',
          color: showConfirm ? '#ffffff' : '#991b1b',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: isRemoving ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          flexShrink: 0,
          marginLeft: '12px',
          opacity: isRemoving ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isRemoving && !showConfirm) {
            e.currentTarget.style.background = '#fecaca';
          }
        }}
        onMouseLeave={(e) => {
          if (!isRemoving && !showConfirm) {
            e.currentTarget.style.background = '#fee2e2';
          }
        }}
      >
        {isRemoving ? 'Removing...' : showConfirm ? 'Confirm?' : 'Remove'}
      </button>
    </div>
  );
}

