'use client';

import { useState, useEffect } from 'react';
import type { EventDoc } from '@/shared/types/event-doc';
import { getFileExtension, getFileType, getFilenameFromPath } from '@/shared/utils/file-utils';
import { supabase } from '@/shared/lib/supabase/client';
import { XStack, YStack, Text, Input, Button } from '@jarvis/ui-core';

interface DocumentListItemProps {
  doc: EventDoc;
  onRemove?: () => void;
  onUpdateName?: (docId: string, newName: string) => void; // Sync function to track changes
  onDownload?: () => void;
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function DocumentListItem({ doc, onRemove, onUpdateName, onDownload, isRemoving = false, isUpdating = false }: DocumentListItemProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Use custom name if available, otherwise extract from path
  const displayName = doc.name || getFilenameFromPath(doc.path);
  const [editedName, setEditedName] = useState(displayName);

  // Sync editedName when doc changes
  useEffect(() => {
    setEditedName(displayName);
  }, [displayName]);

  // Use stored file_type if available, otherwise derive from extension
  const fileType = doc.file_type || getFileType(getFileExtension(displayName));
  const extension = getFileExtension(displayName);

  // Format file type for display (PDF is all caps, others are title case)
  const fileTypeDisplay = fileType === 'pdf' 
    ? 'PDF' 
    : fileType.charAt(0).toUpperCase() + fileType.slice(1).toLowerCase();

  // Handle name input change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setEditedName(newName);
    // Track changes in parent component
    if (onUpdateName) {
      onUpdateName(doc.id, newName);
    }
  };

  // Handle Escape key to reset
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setEditedName(displayName);
      if (onUpdateName) {
        onUpdateName(doc.id, displayName);
      }
      e.currentTarget.blur();
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showConfirm) {
      onRemove?.();
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowConfirm(false), 3000);
    }
  };

  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    setIsDownloading(true);
    try {
      // Create signed URL for download (valid for 1 hour)
      const { data, error } = await supabase.storage
        .from('event-docs')
        .createSignedUrl(doc.path, 3600);

      if (error) {
        throw new Error(error.message || 'Failed to generate download URL');
      }

      if (data?.signedUrl) {
        // Open in new tab/window
        window.open(data.signedUrl, '_blank');
      } else {
        throw new Error('No download URL generated');
      }
    } catch (err) {
      console.error('Download error:', err);
      // Could show error to user, but for now just log
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <XStack
      alignItems="center"
      gap="$3"
      padding="$3"
      backgroundColor="$gray1"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      marginBottom="$2"
    >
      <FileIcon fileType={fileType} />
      
      <YStack flex={1} minWidth={0}>
        {onUpdateName ? (
          <Input
            type="text"
            value={editedName}
            onChange={(e: any) => handleNameChange(e)}
            onKeyDown={handleNameKeyDown}
            disabled={isRemoving || isUpdating}
            fontSize="$3"
            fontWeight="500"
            padding="$1"
            backgroundColor={isRemoving || isUpdating ? '$gray1' : '$background'}
          />
        ) : (
          <Text
            fontSize="$3"
            fontWeight="500"
            color="$color"
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayName}
          </Text>
        )}
        <Text fontSize="$2" color="$gray11" marginTop="$1">
          {fileTypeDisplay} • {new Date(doc.created_at).toLocaleDateString()}
        </Text>
      </YStack>

      <XStack gap="$2" alignItems="center">
        {(onDownload !== undefined || (!onRemove && !onUpdateName)) && (
          <Button
            variant="outline"
            size="sm"
            onPress={handleDownload}
            disabled={isDownloading || isRemoving}
            padding="$1.5"
            opacity={isDownloading ? 0.6 : 1}
            title={isDownloading ? 'Downloading...' : 'Download document'}
          >
            {isDownloading ? (
              <Text fontSize="$2">...</Text>
            ) : (
              <DownloadIcon />
            )}
          </Button>
        )}

        {onRemove && (
          <Button
            variant={showConfirm ? 'primary' : 'outline'}
            size="sm"
            onPress={handleRemoveClick}
            disabled={isRemoving}
            padding="$1.5"
            backgroundColor={showConfirm ? '$red6' : 'transparent'}
            borderColor={showConfirm ? undefined : '$red6'}
            color={showConfirm ? '$background' : '$red6'}
            opacity={isRemoving ? 0.6 : 1}
            title={isRemoving ? 'Removing...' : showConfirm ? 'Click to confirm removal' : 'Remove document'}
          >
            {isRemoving ? (
              <Text fontSize="$2">Removing...</Text>
            ) : showConfirm ? (
              <Text fontSize="$2">Confirm?</Text>
            ) : (
              <RemoveIcon />
            )}
          </Button>
        )}
      </XStack>
    </XStack>
  );
}

