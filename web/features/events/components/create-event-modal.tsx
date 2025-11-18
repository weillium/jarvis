'use client';

import { useState, FormEvent, useEffect, useMemo } from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '@/shared/lib/supabase/client';
import { MarkdownEditor } from '@/shared/ui/markdown-editor';
import { FileUpload } from '@/shared/ui/file-upload';
import { useCreateEventMutation } from '@/shared/hooks/use-mutations';
import { withTimeout } from '@/shared/utils/promise-timeout';
import { validateFiles, MAX_FILE_SIZE } from '@/shared/utils/file-validation';
import { getFileExtension, getFileType } from '@/shared/utils/file-utils';
import { YStack, XStack, Text, Button, Input, Alert, Sheet } from '@jarvis/ui-core';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface EventData {
  owner_uid: string;
  title: string;
  topic?: string;
  start_time?: string;
  end_time?: string;
}

/**
 * Helper to get current user session with timeout
 */
async function getSessionWithTimeout(timeoutMs: number = 5000): Promise<{ user: { id: string } }> {
  const sessionPromise = supabase.auth.getSession();
  const result = await withTimeout(sessionPromise, timeoutMs, 'Session retrieval timed out. Please refresh the page and try again.');
  
  const session = result.data?.session;
  if (!session?.user) {
    throw new Error('You must be logged in to create an event');
  }
  
  return { user: session.user };
}

/**
 * Helper to upload a single file with error handling and cleanup
 */
async function uploadFile(
  file: File,
  eventId: string
): Promise<void> {
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
    60000, // 60 seconds per file
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
    10000, // 10 seconds for database insert
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

export function CreateEventModal({ isOpen, onClose, onSuccess }: CreateEventModalProps) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  const createEventMutation = useCreateEventMutation();

  // Memoize timezone list to avoid recalculating on every render
  const timezones = useMemo(() => Intl.supportedValuesOf('timeZone').sort(), []);

  // Auto-set end date to 1 hour after start date when start date changes
  useEffect(() => {
    if (startDate) {
      const oneHourLater = startDate.add(1, 'hour');
      setEndDate(oneHourLater);
    }
  }, [startDate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Validate files before proceeding
      const fileErrors = validateFiles(files);
      if (fileErrors.length > 0) {
        setError(fileErrors.join('\n'));
        return;
      }

      // Get user session
      const { user } = await getSessionWithTimeout(5000);

      // Validate required dates
      if (!startDate) {
        throw new Error('Start time is required');
      }
      
      if (!endDate) {
        throw new Error('End time is required');
      }

      // Validate date logic
      if (endDate.isBefore(startDate) || endDate.isSame(startDate)) {
        throw new Error('End time must be after start time');
      }
      
      const diffHours = endDate.diff(startDate, 'hour', true);
      if (diffHours > 12) {
        throw new Error('End time must be within 12 hours of start time');
      }

      // Prepare event data with timezone conversion
      const eventData: EventData = {
        owner_uid: user.id,
        title: title.trim(),
      };

      if (topic.trim()) {
        eventData.topic = topic.trim();
      }

      // Convert dates to UTC timestamps
      const startDateString = startDate.format('YYYY-MM-DD HH:mm:ss');
      const startDateInTimezone = dayjs.tz(startDateString, timezone);
      eventData.start_time = startDateInTimezone.utc().toISOString();

      const endDateString = endDate.format('YYYY-MM-DD HH:mm:ss');
      const endDateInTimezone = dayjs.tz(endDateString, timezone);
      eventData.end_time = endDateInTimezone.utc().toISOString();

      // Create event using React Query mutation
      const eventResult = await createEventMutation.mutateAsync(eventData);

      // Upload files if any
      if (files.length > 0) {
        // Verify event is accessible (helps with RLS policy checks)
        const verifyPromise = supabase
          .from('events')
          .select('id')
          .eq('id', eventResult.id)
          .single();
        
        const verifyResult = await withTimeout(
          Promise.resolve(verifyPromise),
          5000,
          'Cannot verify event ownership. The event may not be accessible yet. Please try again.'
        ) as { error: { message: string } | null };

        const { error: verifyError } = verifyResult;

        if (verifyError) {
          throw new Error(
            `Cannot verify event ownership: ${verifyError.message}. ` +
            `This may indicate an RLS policy issue or the event was not created properly.`
          );
        }

        // Upload files sequentially with progress tracking
        const uploadPromises = files.map(async (file) => {
          try {
            await uploadFile(file, eventResult.id);
            setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          } catch (err) {
            // Clean up any partial uploads by removing files that were uploaded
            // but failed during database insert
            throw err;
          }
        });

        // Wait for all uploads with overall timeout
        await withTimeout(
          Promise.all(uploadPromises),
          300000, // 5 minutes total for all files
          'Total file upload time exceeded 5 minutes. This may be due to too many large files or slow network connection.'
        );
      }

      // Reset form and close modal only after complete success
      setTitle('');
      setTopic('');
      setStartDate(null);
      setEndDate(null);
      setFiles([]);
      setUploadProgress({});
      setError(null);
      onClose();
      
      // Trigger success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create event';
      setError(errorMessage);
    }
  };

  const handleClose = () => {
    if (!createEventMutation.isPending) {
      setTitle('');
      setTopic('');
      setStartDate(null);
      setEndDate(null);
      setFiles([]);
      setUploadProgress({});
      setError(null);
      onClose();
    }
  };

  const isLoading = createEventMutation.isPending || Object.keys(uploadProgress).length > 0;

  return (
    <Sheet
      modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) {
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
            Create New Event
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={handleClose}
            disabled={isLoading}
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
                <Alert variant="error" style={{ whiteSpace: 'pre-line' }}>
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
                    htmlFor="title"
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
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e: any) => setTitle(e.target.value)}
                    required
                    disabled={isLoading}
                    placeholder="Enter event title"
                    width="100%"
                  />
                </YStack>

                <YStack flex={1} width="100%">
                  <Text
                    htmlFor="timezone"
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
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '15px',
                      backgroundColor: isLoading ? '#f8fafc' : '#ffffff',
                      boxSizing: 'border-box',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      appearance: 'none',
                      backgroundImage: isLoading
                        ? 'none'
                        : `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      paddingRight: '40px',
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
                    htmlFor="start_time"
                    as="label"
                    fontSize="$3"
                    fontWeight="500"
                    color="$gray9"
                    marginBottom="$2"
                    display="block"
                  >
                    Start Time <Text color="$red11">*</Text>
                  </Text>
                  <DateTimePicker
                    value={startDate}
                    onChange={(newValue) => setStartDate(newValue)}
                    disabled={isLoading}
                    minDate={dayjs()}
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
                    htmlFor="end_time"
                    as="label"
                    fontSize="$3"
                    fontWeight="500"
                    color="$gray9"
                    marginBottom="$2"
                    display="block"
                  >
                    End Time <Text color="$red11">*</Text>
                    {startDate && endDate && (
                      <Text fontSize="$2" color="$gray11" fontWeight="400" marginLeft="$2">
                        (auto-set to 1 hour after start)
                      </Text>
                    )}
                  </Text>
                  <DateTimePicker
                    value={endDate}
                    onChange={(newValue) => setEndDate(newValue)}
                    disabled={isLoading || !startDate}
                    minDate={startDate || dayjs()}
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
                  disabled={isLoading}
                />
              </YStack>

              <YStack marginBottom="$6" width="100%">
                <FileUpload
                  files={files}
                  onFilesChange={setFiles}
                  label="Event Documents"
                  instructions={`Upload documents related to this event. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB. You can select multiple files at once.`}
                  disabled={isLoading}
                />
              </YStack>

              <XStack gap="$3" justifyContent="flex-end" width="100%">
                <Button
                  type="button"
                  variant="outline"
                  onPress={handleClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isLoading || !title.trim()}
                >
                  {isLoading ? 'Creating...' : 'Create Event'}
                </Button>
              </XStack>
            </YStack>
          </form>
        </LocalizationProvider>
      </Sheet.Frame>
    </Sheet>
  );
}
