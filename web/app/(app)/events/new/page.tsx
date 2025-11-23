'use client';

import { useState, FormEvent, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '@/shared/lib/supabase/client';
import { useCreateEventMutation } from '@/shared/hooks/use-mutations';
import { withTimeout } from '@/shared/utils/promise-timeout';
import { validateFiles, MAX_FILE_SIZE } from '@/shared/utils/file-validation';
import { getFileExtension, getFileType } from '@/shared/utils/file-utils';
import {
  YStack,
  XStack,
  Button,
  Input,
  Alert,
  Select,
  FileUpload,
  MarkdownEditor,
  FormField,
  ButtonGroup,
  Body,
  Caption,
  DateTimePicker,
  PageContainer,
  PageHeader,
  Heading,
} from '@jarvis/ui-core';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

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

export default function CreateEventPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
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
      const oneHourLater = new Date(startDate.getTime() + 60 * 60 * 1000);
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
      const start = dayjs(startDate);
      const end = dayjs(endDate);

      if (end.isBefore(start) || end.isSame(start)) {
        throw new Error('End time must be after start time');
      }
      
      const diffHours = end.diff(start, 'hour', true);
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
      // The Date object is in local time, so we need to interpret it in the selected timezone
      const startDateString = start.format('YYYY-MM-DD HH:mm:ss');
      const startDateInTimezone = dayjs.tz(startDateString, timezone);
      eventData.start_time = startDateInTimezone.utc().toISOString();

      const endDateString = end.format('YYYY-MM-DD HH:mm:ss');
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

      // Navigate to events list on success
      router.push('/events');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create event';
      setError(errorMessage);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const isLoading = createEventMutation.isPending || Object.keys(uploadProgress).length > 0;

  return (
    <PageContainer>
      <PageHeader>
        <Heading level={2}>Create New Event</Heading>
        <Body tone="muted">Configure the details below to start a new event and optionally upload supporting documents.</Body>
      </PageHeader>

      <form onSubmit={handleSubmit}>
        <YStack gap="$5" maxWidth={1200}>
          {error && (
            <Alert variant="error">
              <Body whitespace="preWrap">{error}</Body>
            </Alert>
          )}

          <XStack gap="$4" $sm={{ flexDirection: 'column' }} $md={{ flexDirection: 'row' }}>
            <FormField flex={1} label="Title" required>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                required
                disabled={isLoading}
                placeholder="Enter event title"
              />
            </FormField>

            <FormField flex={1} label="Timezone">
              <Select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                size="md"
                {...(isLoading ? { disabled: true } : {})}
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
            <FormField
              flex={1}
              label="Start Time"
              required
            >
              <YStack width="100%">
                <Caption marginBottom="$2" fontStyle="italic">
                  Local time when the event begins.
                </Caption>
                <DateTimePicker
                  id="start_time"
                  value={startDate}
                  onChange={setStartDate}
                  required
                  disabled={isLoading}
                  minDate={new Date()}
                />
              </YStack>
            </FormField>

            <FormField
              flex={1}
              label="End Time"
              required
            >
              <YStack width="100%">
                <Caption marginBottom="$2" fontStyle="italic">
                  {startDate && endDate ? 'Auto-set to 1 hour after start time by default.' : 'Set to 1 hour after start time by default.'}
                </Caption>
                <DateTimePicker
                  id="end_time"
                  value={endDate}
                  onChange={setEndDate}
                  required
                  disabled={isLoading || !startDate}
                  minDate={startDate ?? new Date()}
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
            disabled={isLoading}
          />

          <FileUpload
            files={files}
            onFilesChange={setFiles}
            label="Event Documents"
            instructions={`Upload documents related to this event. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB. You can select multiple files at once.`}
            disabled={isLoading}
          />

          <ButtonGroup>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isLoading || !title.trim()}>
              {isLoading ? 'Creating…' : 'Create Event'}
            </Button>
          </ButtonGroup>
        </YStack>
      </form>
    </PageContainer>
  );
}

