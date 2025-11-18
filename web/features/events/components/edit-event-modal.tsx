'use client';

import { useState, FormEvent, useEffect } from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { EventWithStatus } from '@/shared/types/event';
import { MarkdownEditor } from '@/shared/ui/markdown-editor';
import { FileUpload } from '@/shared/ui/file-upload';
import { useUpdateEventMutation, useDeleteEventDocMutation, useUpdateEventDocNameMutation } from '@/shared/hooks/use-mutations';
import { useEventDocsQuery } from '@/shared/hooks/use-event-docs-query';
import { DocumentListItem } from './document-list-item';
import { supabase } from '@/shared/lib/supabase/client';
import { withTimeout } from '@/shared/utils/promise-timeout';
import { validateFiles, MAX_FILE_SIZE } from '@/shared/utils/file-validation';
import { getFilenameFromPath, getFileExtension, getFileType } from '@/shared/utils/file-utils';
import { YStack, XStack, Text, Button, Input, Alert, Sheet } from '@jarvis/ui-core';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventWithStatus;
  onSuccess?: (updatedEvent: EventWithStatus) => void;
}

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

export function EditEventModal({ isOpen, onClose, event, onSuccess }: EditEventModalProps) {
  const [title, setTitle] = useState(event.title);
  const [topic, setTopic] = useState(event.topic || '');
  const [startDate, setStartDate] = useState<Dayjs | null>(
    event.start_time ? dayjs(event.start_time) : null
  );
  const [endDate, setEndDate] = useState<Dayjs | null>(
    event.end_time ? dayjs(event.end_time) : null
  );
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removingDocs, setRemovingDocs] = useState<Set<string>>(new Set());
  const [pendingDocNameChanges, setPendingDocNameChanges] = useState<Map<string, string>>(new Map());

  // Mutation hooks
  const updateEventMutation = useUpdateEventMutation(event.id);
  const deleteDocMutation = useDeleteEventDocMutation(event.id);
  const updateDocNameMutation = useUpdateEventDocNameMutation(event.id);
  
  // Fetch existing documents
  const { data: existingDocs } = useEventDocsQuery(event.id);
  
  const loading = updateEventMutation.isPending || deleteDocMutation.isPending || updateDocNameMutation.isPending;

  // Get list of common timezones
  const timezones = Intl.supportedValuesOf('timeZone').sort();

  // Reset form when event changes
  useEffect(() => {
    setTitle(event.title);
    setTopic(event.topic || '');
    setStartDate(event.start_time ? dayjs(event.start_time) : null);
    setEndDate(event.end_time ? dayjs(event.end_time) : null);
    setError(null);
    setNewFiles([]);
    setRemovingDocs(new Set());
    setPendingDocNameChanges(new Map());
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

    // Validate dates if provided
    if (startDate && endDate) {
      if (endDate.isBefore(startDate) || endDate.isSame(startDate)) {
        setError('End time must be after start time');
        return;
      }
      
      const diffHours = endDate.diff(startDate, 'hour', true);
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
      const dateString = startDate.format('YYYY-MM-DD HH:mm:ss');
      const dateInTimezone = dayjs.tz(dateString, timezone);
      const isoString = dateInTimezone.utc().toISOString();
      if (isoString !== event.start_time) {
        updateData.start_time = isoString;
      }
    } else if (event.start_time) {
      updateData.start_time = null;
    }

    if (endDate) {
      const dateString = endDate.format('YYYY-MM-DD HH:mm:ss');
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
        onSuccess: (updatedEvent) => {
          // Reset form and close modal
          setNewFiles([]);
          setPendingDocNameChanges(new Map());
          onClose();
          
          // Trigger success callback if provided
          if (onSuccess && updatedEvent) {
            onSuccess(updatedEvent);
          }
        },
        onError: (err) => {
          const errorMessage = err instanceof Error ? err.message : 'Failed to update event';
          setError(errorMessage);
        },
      });
    } else if (newFiles.length > 0 || pendingDocNameChanges.size > 0) {
      // If only files were uploaded or document names changed, just close
      setNewFiles([]);
      setPendingDocNameChanges(new Map());
      onClose();
      if (onSuccess) {
        onSuccess(event); // Pass current event since no event data changes were made
      }
    } else {
      // No changes at all
      onClose();
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTitle(event.title);
      setTopic(event.topic || '');
      setStartDate(event.start_time ? dayjs(event.start_time) : null);
      setEndDate(event.end_time ? dayjs(event.end_time) : null);
      setError(null);
      setNewFiles([]);
      setPendingDocNameChanges(new Map());
      onClose();
    }
  };

  return (
    <Sheet
      modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) {
          handleClose();
        }
      }}
      snapPoints={[95]}
      dismissOnSnapToBottom
      zIndex={1000}
    >
      <Sheet.Overlay
        animation="lazy"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
        opacity={0.5}
        backgroundColor="black"
      />
      <Sheet.Handle />
      <Sheet.Frame
        padding={0}
        backgroundColor="$background"
        borderRadius="$4"
        maxWidth={1200}
        width="100%"
        maxHeight="95vh"
      >
        <XStack
          padding="$6"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
          justifyContent="space-between"
          alignItems="center"
        >
          <Text fontSize="$7" fontWeight="600" color="$color" margin={0}>
            Edit Event
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={handleClose}
            disabled={loading}
            circular
            width={32}
            height={32}
            padding={0}
          >
            ×
          </Button>
        </XStack>

        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <form onSubmit={handleSubmit}>
            <YStack padding="$8" gap="$6">
              {error && (
                <Alert variant="error">
                  {error}
                </Alert>
              )}

              <XStack
                gap="$6"
                marginBottom="$6"
                $sm={{ flexDirection: 'column' }}
                $md={{ flexDirection: 'row' }}
              >
                <YStack flex={1} width="100%">
                  <Text
                    htmlFor="edit-title"
                    as="label"
                    fontSize="$3"
                    fontWeight="500"
                    color="$gray9"
                    marginBottom="$2"
                    display="block"
                  >
                    Title <Text color="$red11">*</Text>
                  </Text>
                  <Input
                    id="edit-title"
                    type="text"
                    value={title}
                    onChange={(e: any) => setTitle(e.target.value)}
                    required
                    disabled={loading}
                    placeholder="Enter event title"
                    width="100%"
                  />
                </YStack>

                <YStack flex={1} width="100%">
                  <Text
                    htmlFor="edit-timezone"
                    as="label"
                    fontSize="$3"
                    fontWeight="500"
                    color="$gray9"
                    marginBottom="$2"
                    display="block"
                  >
                    Timezone
                  </Text>
                  <select
                    id="edit-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '15px',
                      backgroundColor: loading ? '#f8fafc' : '#ffffff',
                      boxSizing: 'border-box',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </YStack>
              </XStack>

              <XStack
                gap="$6"
                marginBottom="$6"
                $sm={{ flexDirection: 'column' }}
                $md={{ flexDirection: 'row' }}
              >
                <YStack flex={1} width="100%">
                  <Text
                    htmlFor="edit-start_time"
                    as="label"
                    fontSize="$3"
                    fontWeight="500"
                    color="$gray9"
                    marginBottom="$2"
                    display="block"
                  >
                    Start Time
                  </Text>
                  <DateTimePicker
                    value={startDate}
                    onChange={(newValue) => setStartDate(newValue)}
                    disabled={loading}
                    minutesStep={15}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: 'small',
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            fontSize: '15px',
                            borderRadius: '6px',
                          },
                        },
                      },
                    }}
                  />
                </YStack>

                <YStack flex={1} width="100%">
                  <Text
                    htmlFor="edit-end_time"
                    as="label"
                    fontSize="$3"
                    fontWeight="500"
                    color="$gray9"
                    marginBottom="$2"
                    display="block"
                  >
                    End Time
                  </Text>
                  <DateTimePicker
                    value={endDate}
                    onChange={(newValue) => setEndDate(newValue)}
                    disabled={loading || !startDate}
                    minDate={startDate || undefined}
                    minutesStep={15}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        size: 'small',
                        placeholder: startDate ? "Select end date and time" : "Select start time first",
                        sx: {
                          '& .MuiOutlinedInput-root': {
                            fontSize: '15px',
                            borderRadius: '6px',
                          },
                        },
                      },
                    }}
                  />
                </YStack>
              </XStack>

              <YStack marginBottom="$6" width="100%">
                <MarkdownEditor
                  value={topic}
                  onChange={setTopic}
                  label="Topic"
                  instructions="Briefly describe the event. You can use markdown formatting for rich text."
                  height={180}
                  disabled={loading}
                />
              </YStack>

              {/* Event Documents Section */}
              <YStack marginBottom="$6" width="100%">
                <Text
                  fontSize="$3"
                  fontWeight="500"
                  color="$gray9"
                  marginBottom="$3"
                  display="block"
                >
                  Event Documents
                </Text>
                
                {/* Existing Documents List */}
                {existingDocs && existingDocs.length > 0 && (
                  <YStack marginBottom="$4" gap="$2">
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
                
                {/* File Upload Component */}
                <FileUpload
                  files={newFiles}
                  onFilesChange={setNewFiles}
                  label={existingDocs && existingDocs.length > 0 ? "Add More Documents" : "Upload Documents"}
                  instructions={`Upload additional documents. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB.`}
                  disabled={loading}
                />
              </YStack>

              <XStack gap="$3" justifyContent="flex-end" width="100%">
                <Button
                  type="button"
                  variant="outline"
                  onPress={handleClose}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || !title.trim()}
                >
                  {loading ? 'Updating...' : 'Update Event'}
                </Button>
              </XStack>
            </YStack>
          </form>
        </LocalizationProvider>
      </Sheet.Frame>
    </Sheet>
  );
}

