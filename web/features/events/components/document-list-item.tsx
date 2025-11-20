'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EventDoc } from '@/shared/types/event-doc';
import { getFileExtension, getFileType, getFilenameFromPath } from '@/shared/utils/file-utils';
import { supabase } from '@/shared/lib/supabase/client';
import {
  Button,
  Body,
  FileListItem,
  FilePdfIcon,
  FileDocumentIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FilePresentationIcon,
  FileArchiveIcon,
  FileGenericIcon,
  DownloadIcon,
  RemoveIcon,
} from '@jarvis/ui-core';

interface DocumentListItemProps {
  doc: EventDoc;
  onRemove?: () => void;
  onUpdateName?: (docId: string, newName: string) => void;
  onDownload?: () => void;
  isRemoving?: boolean;
  isUpdating?: boolean;
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

  // Format file type for display (PDF is all caps, others are title case)
  const fileTypeDisplay = fileType === 'pdf' 
    ? 'PDF' 
    : fileType.charAt(0).toUpperCase() + fileType.slice(1).toLowerCase();

  const handleNameChange = (newName: string) => {
    setEditedName(newName);
    onUpdateName?.(doc.id, newName);
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

  const handleRemoveClick = () => {
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

  const icon = useMemo(() => {
    const fileTypeIcons: Record<string, ReactNode> = {
      pdf: <FilePdfIcon size={20} />,
      document: <FileDocumentIcon size={20} />,
      image: <FileImageIcon size={20} />,
      spreadsheet: <FileSpreadsheetIcon size={20} />,
      presentation: <FilePresentationIcon size={20} />,
      archive: <FileArchiveIcon size={20} />,
    };
    return fileTypeIcons[fileType] ?? <FileGenericIcon size={20} />;
  }, [fileType]);

  const secondaryText = `${fileTypeDisplay} • ${new Date(doc.created_at).toLocaleDateString()}`;

  const showDownloadButton = onDownload !== undefined || (!onRemove && !onUpdateName);

  const actions = (
    <>
      {showDownloadButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading || isRemoving}
          opacity={isDownloading ? 0.6 : 1}
        >
          {isDownloading ? <Body size="sm">…</Body> : <DownloadIcon />}
        </Button>
      )}
      {onRemove && (
        <Button
          variant={showConfirm ? 'primary' : 'outline'}
          size="sm"
          onClick={handleRemoveClick}
          disabled={isRemoving}
          backgroundColor={showConfirm ? '$red6' : 'transparent'}
          borderColor={showConfirm ? undefined : '$red6'}
          color={showConfirm ? '$background' : '$red6'}
          opacity={isRemoving ? 0.6 : 1}
        >
          {isRemoving ? (
            <Body size="sm">Removing...</Body>
          ) : showConfirm ? (
            <Body size="sm">Confirm?</Body>
          ) : (
            <RemoveIcon />
          )}
        </Button>
      )}
    </>
  );

  return (
    <FileListItem
      icon={icon}
      name={displayName}
      editable={Boolean(onUpdateName)}
      value={editedName}
      onValueChange={handleNameChange}
      onInputKeyDown={handleNameKeyDown}
      disabled={isRemoving || isUpdating}
      secondaryText={secondaryText}
      actions={actions}
      marginBottom="$2"
    />
  );
}
