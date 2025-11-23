'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventWithStatus } from '@/shared/types/event';
import { useUpdateEventMutation, useDeleteEventDocMutation, useUpdateEventDocNameMutation } from '@/shared/hooks/use-mutations';
import { useEventDocsQuery } from '@/shared/hooks/use-event-docs-query';
import { useEventQuery } from '@/shared/hooks/use-event-query';
import { DocumentListItem } from '@/features/events/components/document-list-item';
import { supabase } from '@/shared/lib/supabase/client';
import { withTimeout } from '@/shared/utils/promise-timeout';
import { validateFiles, MAX_FILE_SIZE } from '@/shared/utils/file-validation';
import { getFilenameFromPath, getFileExtension, getFileType } from '@/shared/utils/file-utils';
import {
  YStack,
  XStack,
  Button,
  Input,
  Alert,
  Select,
  Label,
  Body,
  FileUpload,
  MarkdownEditor,
  FormField,
  ButtonGroup,
  DateTimePicker,
  Caption,
  PageContainer,
  PageHeader,
  Heading,
  LoadingState,
} from '@jarvis/ui-core';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Helper to upload a single file (reused from create-event-modal)
async function uploadFile(file: File, eventId: string): Promise<void> {
  const originalFileName = file.name;
  const fileExt = file.name.split('.').pop() || 'file';
  const fileName = `${eventId}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
  const filePath = fileName;

  // Upload to storage with timeout
  const uploadResult = await withTimeout(
    supabase.storage
      .from('event-docs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      }),
    60000,
    `Upload timeout for ${file.name}. This may be due to large file size or slow network connection.`
  );

  const { error: uploadError, data } = uploadResult;

  if (uploadError) {
    let errorMsg = `Failed to upload ${file.name}`;
    
    if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
      errorMsg += ': Storage bucket "event-docs" does not exist. Please create the bucket in Supabase Dashboard or contact support.';
    } else if (uploadError.message?.includes('permission') || uploadError.message?.includes('policy')) {
      errorMsg += ': Permission denied. Please verify you own this event and try again.';
    } else if (uploadError.message?.includes('size') || uploadError.message?.includes('limit')) {
      errorMsg += `: File size exceeds limit (${MAX_FILE_SIZE / 1024 / 1024}MB). Please upload a smaller file.`;
    } else {
      errorMsg += `: ${uploadError.message}`;
    }
    
    throw new Error(errorMsg);
  }

  // Determine file type from extension
  const fileExtension = getFileExtension(originalFileName);
  const fileType = getFileType(fileExtension);

  // Create database record with timeout
  const insertPromise = supabase
    .from('event_docs')
    .insert([
      {
        event_id: eventId,
        path: filePath,
        name: originalFileName,
        file_type: fileType,
      },
    ]);
  
  const insertResult = await withTimeout(
    Promise.resolve(insertPromise),
    10000,
    `Database insert timeout for ${file.name}. The file was uploaded but the record could not be created.`
  ) as { error: { message: string } | null };

  const { error: docError } = insertResult;

  if (docError) {
    // Clean up uploaded file
    if (data?.path) {
      try {
        await supabase.storage.from('event-docs').remove([data.path]);
      } catch (cleanupError) {
        console.error('Failed to cleanup uploaded file after DB insert failure:', cleanupError);
      }
    }
    
    let errorMsg = `Failed to create document record for ${file.name}`;
    
    if (docError.message?.includes('permission') || docError.message?.includes('policy')) {
      errorMsg += ': Permission denied. Please verify you own this event.';
    } else {
      errorMsg += `: ${docError.message}`;
    }
    
    throw new Error(errorMsg);
  }
}

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId as string;
  
  const { data: event, isLoading: eventLoading } = useEventQuery(eventId);
  const { data: existingDocs } = useEventDocsQuery(eventId);
  
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removingDocs, setRemovingDocs] = useState<Set<string>>(new Set());
  const [pendingDocNameChanges, setPendingDocNameChanges] = useState<Map<string, string>>(new Map());

  // Mutation hooks
  const updateEventMutation = useUpdateEventMutation(eventId);
  const deleteDocMutation = useDeleteEventDocMutation(eventId);
  const updateDocNameMutation = useUpdateEventDocNameMutation(eventId);
  
  const loading = updateEventMutation.isPending || deleteDocMutation.isPending || updateDocNameMutation.isPending;

  // Get list of common timezones
  const timezones = Intl.supportedValuesOf('timeZone').sort();

  // Initialize form when event data loads
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setTopic(event.topic || '');
      setStartDate(event.start_time ? dayjs(event.start_time).toDate() : null);
      setEndDate(event.end_time ? dayjs(event.end_time).toDate() : null);
      setError(null);
      setNewFiles([]);
      setRemovingDocs(new Set());
      setPendingDocNameChanges(new Map());
    }
  }, [event]);

  const handleRemoveDoc = async (docId: string) => {
    setRemovingDocs(prev => new Set(prev).add(docId));
    try {
      await deleteDocMutation.mutateAsync(docId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove document';
      setError(errorMessage);
    } finally {
      setRemovingDocs(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  // Track document name changes (will be saved on form submit)
  const handleDocNameChange = (docId: string, newName: string) => {
    setPendingDocNameChanges(prev => {
      const next = new Map(prev);
      // Store the raw value (will be trimmed on save)
      next.set(docId, newName);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!event) return;

    // Validate dates if provided
    if (startDate && endDate) {
      const start = dayjs(startDate);
      const end = dayjs(endDate);
      
      if (end.isBefore(start) || end.isSame(start)) {
        setError('End time must be after start time');
        return;
      }
      
      const diffHours = end.diff(start, 'hour', true);
      if (diffHours > 12) {
        setError('End time must be within 12 hours of start time');
        return;
      }
    }

    // Prepare update data
    const updateData: {
      title?: string;
      topic?: string | null;
      start_time?: string | null;
      end_time?: string | null;
    } = {};

    if (title.trim() !== event.title) {
      updateData.title = title.trim();
    }

    if (topic.trim() !== (event.topic || '')) {
      updateData.topic = topic.trim() || null;
    }

    // Convert dates to UTC timestamps
    if (startDate) {
      const start = dayjs(startDate);
      const dateString = start.format('YYYY-MM-DD HH:mm:ss');
      const dateInTimezone = dayjs.tz(dateString, timezone);
      const isoString = dateInTimezone.utc().toISOString();
      if (isoString !== event.start_time) {
        updateData.start_time = isoString;
      }
    } else if (event.start_time) {
      updateData.start_time = null;
    }

    if (endDate) {
      const end = dayjs(endDate);
      const dateString = end.format('YYYY-MM-DD HH:mm:ss');
      const dateInTimezone = dayjs.tz(dateString, timezone);
      const isoString = dateInTimezone.utc().toISOString();
      if (isoString !== event.end_time) {
        updateData.end_time = isoString;
      }
    } else if (event.end_time) {
      updateData.end_time = null;
    }

    // Upload new files if any
    if (newFiles.length > 0) {
      // Validate files before uploading
      const fileErrors = validateFiles(newFiles);
      if (fileErrors.length > 0) {
        setError(fileErrors.join('\n'));
        return;
      }

      try {
        // Upload all new files
        const uploadPromises = newFiles.map(file => uploadFile(file, event.id));
        await withTimeout(
          Promise.all(uploadPromises),
          300000, // 5 minutes total for all files
          'Total file upload time exceeded 5 minutes. This may be due to too many large files or slow network connection.'
        );
      } catch (uploadErr) {
        const errorMessage = uploadErr instanceof Error ? uploadErr.message : 'Failed to upload files';
        setError(errorMessage);
        return;
      }
    }

    // Update document names if there are changes
    if (pendingDocNameChanges.size > 0 && existingDocs) {
      try {
        // Only update documents where the name actually changed
        const changesToSave: Array<[string, string]> = [];
        
        for (const [docId, newName] of pendingDocNameChanges.entries()) {
          const doc = existingDocs.find(d => d.id === docId);
          if (!doc) continue;
          
          const currentName = doc.name || getFilenameFromPath(doc.path);
          const trimmedNewName = newName.trim();
          const trimmedCurrentName = currentName.trim();
          
          // Only save if the trimmed names are different
          if (trimmedNewName !== trimmedCurrentName && trimmedNewName.length > 0) {
            changesToSave.push([docId, trimmedNewName]);
          }
        }

        if (changesToSave.length > 0) {
          const docNamePromises = changesToSave.map(([docId, name]) =>
            updateDocNameMutation.mutateAsync({ docId, name })
          );
          await Promise.all(docNamePromises);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update document names';
        setError(errorMessage);
        return;
      }
    }

    // Update event data if there are changes
    if (Object.keys(updateData).length > 0) {
      updateEventMutation.mutate(updateData, {
        onSuccess: () => {
          // Navigate back to event detail page
          router.push(`/events/${eventId}`);
        },
        onError: (err) => {
          const errorMessage = err instanceof Error ? err.message : 'Failed to update event';
          setError(errorMessage);
        },
      });
    } else if (newFiles.length > 0 || pendingDocNameChanges.size > 0) {
      // If only files were uploaded or document names changed, navigate back
      router.push(`/events/${eventId}`);
    } else {
      // No changes at all, navigate back
      router.push(`/events/${eventId}`);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (eventLoading) {
    return (
      <PageContainer>
        <LoadingState message="Loading event..." />
      </PageContainer>
    );
  }

  if (!event) {
    return (
      <PageContainer>
        <PageHeader>
          <Heading level={2}>Event Not Found</Heading>
        </PageHeader>
        <Alert variant="error">
          <Body>The event you're trying to edit could not be found.</Body>
        </Alert>
        <ButtonGroup marginTop="$4">
          <Button variant="outline" onClick={handleCancel}>
            Go Back
          </Button>
        </ButtonGroup>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader>
        <Heading level={2}>Edit Event</Heading>
        <Body tone="muted">Update event details, adjust scheduling, or manage reference documents.</Body>
      </PageHeader>

      <form onSubmit={handleSubmit}>
        <YStack gap="$5" maxWidth={1200}>
          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}

          <XStack gap="$4" $sm={{ flexDirection: 'column' }} $md={{ flexDirection: 'row' }}>
            <FormField flex={1} label="Title" required>
              <Input
                id="edit-title"
                type="text"
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                required
                disabled={loading}
                placeholder="Enter event title"
              />
            </FormField>

            <FormField flex={1} label="Timezone">
              <Select
                id="edit-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={loading}
                size="md"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </FormField>
          </XStack>

          <XStack gap="$4" $sm={{ flexDirection: 'column' }} $md={{ flexDirection: 'row' }} alignItems="flex-start">
            <FormField flex={1} label="Start Time">
              <YStack width="100%">
                <Caption marginBottom="$2" fontStyle="italic">
                  Local time when the event begins.
                </Caption>
                <DateTimePicker
                  id="edit-start_time"
                  value={startDate}
                  onChange={setStartDate}
                  disabled={loading}
                />
              </YStack>
            </FormField>

            <FormField flex={1} label="End Time">
              <YStack width="100%">
                <Caption marginBottom="$2" fontStyle="italic">
                  End time for the event.
                </Caption>
                <DateTimePicker
                  id="edit-end_time"
                  value={endDate}
                  onChange={setEndDate}
                  disabled={loading || !startDate}
                  minDate={startDate ?? undefined}
                />
              </YStack>
            </FormField>
          </XStack>

          <MarkdownEditor
            value={topic}
            onChange={setTopic}
            label="Topic"
            instructions="Briefly describe the event. You can use markdown formatting for rich text."
            height={180}
            disabled={loading}
          />

          <YStack width="100%">
            <Label>Event Documents</Label>
            {existingDocs && existingDocs.length > 0 && (
              <YStack marginTop="$3" marginBottom="$4" gap="$2">
                {existingDocs.map((doc) => (
                  <DocumentListItem
                    key={doc.id}
                    doc={doc}
                    onRemove={() => handleRemoveDoc(doc.id)}
                    onUpdateName={handleDocNameChange}
                    isRemoving={removingDocs.has(doc.id)}
                    isUpdating={false}
                  />
                ))}
              </YStack>
            )}
            <FileUpload
              files={newFiles}
              onFilesChange={setNewFiles}
              label={existingDocs && existingDocs.length > 0 ? 'Add More Documents' : 'Upload Documents'}
              instructions={`Upload additional documents. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB.`}
              disabled={loading}
            />
          </YStack>

          <ButtonGroup>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={loading || !title.trim()}>
              {loading ? 'Updating…' : 'Update Event'}
            </Button>
          </ButtonGroup>
        </YStack>
      </form>
    </PageContainer>
  );
}

