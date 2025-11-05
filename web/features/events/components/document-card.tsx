'use client';

import { useState } from 'react';
import { supabase } from '@/shared/lib/supabase/client';
import type { EventDoc } from '@/shared/types/event-doc';
import { getFileExtension, getFileType, getFileIcon, getFilenameFromPath } from '@/shared/utils/file-utils';

interface DocumentCardProps {
  doc: EventDoc;
  eventId: string;
}

export function DocumentCard({ doc, eventId }: DocumentCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Use custom name if available, otherwise extract from path
  const displayName = doc.name || getFilenameFromPath(doc.path);
  const extension = getFileExtension(displayName);
  const fileType = getFileType(extension);
  const icon = getFileIcon(fileType);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);

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
      const errorMessage = err instanceof Error ? err.message : 'Failed to download file';
      setDownloadError(errorMessage);
      console.error('Download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'all 0.2s',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#cbd5e1';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e2e8f0';
        e.currentTarget.style.boxShadow = 'none';
      }}
      onClick={handleDownload}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            fontSize: '32px',
            lineHeight: '1',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#0f172a',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={displayName}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#64748b',
              textTransform: 'uppercase',
            }}
          >
            {extension || 'file'}
          </div>
        </div>
      </div>

      {downloadError && (
        <div
          style={{
            fontSize: '12px',
            color: '#dc2626',
            padding: '8px',
            background: '#fee2e2',
            borderRadius: '4px',
          }}
        >
          {downloadError}
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDownload();
        }}
        disabled={isDownloading}
        style={{
          padding: '8px 12px',
          background: isDownloading ? '#94a3b8' : '#1e293b',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: '500',
          cursor: isDownloading ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
          width: '100%',
        }}
      >
        {isDownloading ? 'Preparing...' : 'Download'}
      </button>
    </div>
  );
}

