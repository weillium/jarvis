'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { YStack, XStack } from 'tamagui';
import { Card } from './Card';
import { Label, Body } from './Typography';
import { Button } from './Button';
import { FileGenericIcon } from '../icons';

export interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  label?: string;
  instructions?: string;
  multiple?: boolean;
  disabled?: boolean;
  acceptedFileTypes?: string;
  emptyStateLabel?: string;
  emptyStateSubLabel?: string;
}

interface FileItemProps {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function FileItem({ file, onRemove, disabled }: FileItemProps) {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      padding="$3"
      backgroundColor="$gray1"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      gap="$3"
    >
      <YStack flex={1} minWidth={0}>
      <Body size="sm" weight="medium" numberOfLines={1}>
          {file.name}
        </Body>
        <Body size="xs" tone="muted">
          {formatFileSize(file.size)}
        </Body>
      </YStack>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onPress={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        Remove
      </Button>
    </XStack>
  );
}

export function FileUpload({
  files,
  onFilesChange,
  label,
  instructions,
  multiple = true,
  disabled = false,
  acceptedFileTypes,
  emptyStateLabel = 'Click to upload or drag and drop',
  emptyStateSubLabel,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (newFiles: File[]) => {
    if (multiple) {
      onFilesChange([...files, ...newFiles]);
    } else {
      onFilesChange(newFiles);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handleFileChange(Array.from(event.target.files));
    }
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled && event.dataTransfer.files.length > 0) {
      const newFiles = Array.from(event.dataTransfer.files);
      handleFileChange(newFiles);
    }
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const openPicker = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const emptySubLabel =
    emptyStateSubLabel ?? (multiple ? 'Multiple files supported' : 'Single file upload');

  return (
    <YStack width="100%">
      {label ? <Label>{label}</Label> : null}
      {instructions ? (
        <Body size="xs" tone="muted" marginBottom="$2">
          {instructions}
        </Body>
      ) : null}

      {files.length === 0 && (
        <Card
          borderWidth={2}
          borderStyle="dashed"
          borderColor={isDragging ? '$color' : '$borderColor'}
          backgroundColor={disabled ? '$gray2' : isDragging ? '$gray1' : '$background'}
          pressStyle={{ scale: 0.99 }}
          hoverStyle={{ borderColor: '$borderColorHover' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPress={openPicker}
          cursor={disabled ? 'not-allowed' : 'pointer'}
        >
          <YStack alignItems="center" gap="$2" color="$gray9" padding="$4">
            <YStack marginBottom="$2">
              <FileGenericIcon size={48} />
            </YStack>
            <Body size="sm" weight="medium" color="$color">
              {emptyStateLabel}
            </Body>
            <Body size="sm" weight="medium" tone="muted">
              {emptySubLabel}
            </Body>
          </YStack>
        </Card>
      )}

      <YStack width={0} height={0} overflow="hidden" position="absolute" pointerEvents="none">
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          hidden
          onChange={handleInputChange}
          disabled={disabled}
          accept={acceptedFileTypes}
        />
      </YStack>

      {files.length > 0 && (
        <YStack marginTop="$4" gap="$3">
          <Body size="sm" weight="medium" tone="muted">
            Selected Files ({files.length})
          </Body>
          <YStack gap="$2">
            {files.map((file, index) => (
              <FileItem
                key={`${file.name}-${index}-${file.size}`}
                file={file}
                onRemove={() => {
                  const newFiles = files.filter((_, i) => i !== index);
                  onFilesChange(newFiles);
                }}
                disabled={disabled}
              />
            ))}
          </YStack>
          <XStack gap="$3" flexWrap="wrap">
            <Button variant="outline" size="sm" disabled={disabled} onPress={openPicker}>
              Add more files
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onPress={() => {
                onFilesChange([]);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              Clear All
            </Button>
          </XStack>
        </YStack>
      )}
    </YStack>
  );
}
