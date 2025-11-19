'use client';

import { useState } from 'react';
import { supabase } from '@/shared/lib/supabase/client';
import type { EventDoc } from '@/shared/types/event-doc';
import { getFileExtension, getFileType, getFilenameFromPath } from '@/shared/utils/file-utils';
import { YStack, XStack, Text, Card, Button, Alert } from '@jarvis/ui-core';
import {
  FilePdfIcon,
  FileDocumentIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FilePresentationIcon,
  FileArchiveIcon,
  FileGenericIcon,
} from '@jarvis/ui-core/icons';

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
  const iconMap: Record<string, React.ReactNode> = {
    pdf: <FilePdfIcon size={32} />,
    document: <FileDocumentIcon size={32} />,
    image: <FileImageIcon size={32} />,
    spreadsheet: <FileSpreadsheetIcon size={32} />,
    presentation: <FilePresentationIcon size={32} />,
    archive: <FileArchiveIcon size={32} />,
  };
  const icon = iconMap[fileType] ?? <FileGenericIcon size={32} />;

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
    <Card
      padding="$4"
      cursor="pointer"
      hoverStyle={{
        borderColor: '$borderColorHover',
        shadowColor: '$color',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
      }}
      onPress={handleDownload}
    >
      <YStack gap="$3">
        <XStack alignItems="center" gap="$3">
          <YStack flexShrink={0}>{icon}</YStack>
          <YStack flex={1} minWidth={0}>
            <Text
              fontSize="$3"
              fontWeight="500"
              color="$color"
              marginBottom="$1"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayName}
            </Text>
            <Text
              fontSize="$2"
              color="$gray11"
              textTransform="uppercase"
            >
              {extension || 'file'}
            </Text>
          </YStack>
        </XStack>

        {downloadError && (
          <Alert variant="error">
            <Text fontSize="$2">{downloadError}</Text>
          </Alert>
        )}

        <Button
          onPress={(e: any) => {
            e?.stopPropagation();
            handleDownload();
          }}
          disabled={isDownloading}
          width="100%"
          size="sm"
        >
          {isDownloading ? 'Preparing...' : 'Download'}
        </Button>
      </YStack>
    </Card>
  );
}
