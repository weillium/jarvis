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

  // Create database record with timeout
  const insertPromise = supabase
    .from('event_docs')
    .insert([
      {
        event_id: eventId,
        path: filePath,
        name: originalFileName,
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

  const handleUpdateDocName = async (docId: string, newName: string) => {
    await updateDocNameMutation.mutateAsync({ docId, name: newName });
  };

  if (!isOpen) return null;

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

    // Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      onClose();
      return;
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

    // Update event data if there are changes
    if (Object.keys(updateData).length > 0) {
      updateEventMutation.mutate(updateData, {
        onSuccess: (updatedEvent) => {
          // Reset form and close modal
          setNewFiles([]);
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
    } else if (newFiles.length > 0) {
      // If only files were uploaded (no event data changes), just close
      setNewFiles([]);
      onClose();
      if (onSuccess) {
        onSuccess(event); // Pass current event since no changes were made
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
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '24px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '95vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              fontSize: '24px',
              fontWeight: '600',
              color: '#0f172a',
              margin: 0,
            }}
          >
            Edit Event
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              color: '#64748b',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <form onSubmit={handleSubmit} style={{ padding: '32px', boxSizing: 'border-box' }}>
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#991b1b',
                  fontSize: '14px',
                  marginBottom: '24px',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              <div style={{ width: '100%', boxSizing: 'border-box' }}>
                <label
                  htmlFor="edit-title"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="edit-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Enter event title"
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '15px',
                    background: loading ? '#f8fafc' : '#ffffff',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ width: '100%', boxSizing: 'border-box' }}>
                <label
                  htmlFor="edit-timezone"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Timezone
                </label>
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
                  }}
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              <div style={{ width: '100%', boxSizing: 'border-box' }}>
                <label
                  htmlFor="edit-start_time"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Start Time
                </label>
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
              </div>

              <div style={{ width: '100%', boxSizing: 'border-box' }}>
                <label
                  htmlFor="edit-end_time"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  End Time
                </label>
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
              </div>
            </div>

            <div style={{ marginBottom: '24px', width: '100%', boxSizing: 'border-box' }}>
              <MarkdownEditor
                value={topic}
                onChange={setTopic}
                label="Topic"
                instructions="Briefly describe the event. You can use markdown formatting for rich text."
                height={180}
                disabled={loading}
              />
            </div>

            {/* Event Documents Section */}
            <div style={{ marginBottom: '24px', width: '100%', boxSizing: 'border-box' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '12px',
              }}>
                Event Documents
              </label>
              
              {/* Existing Documents List */}
              {existingDocs && existingDocs.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  {existingDocs.map((doc) => (
                    <DocumentListItem
                      key={doc.id}
                      doc={doc}
                      onRemove={() => handleRemoveDoc(doc.id)}
                      onUpdateName={handleUpdateDocName}
                      isRemoving={removingDocs.has(doc.id)}
                      isUpdating={updateDocNameMutation.isPending}
                    />
                  ))}
                </div>
              )}
              
              {/* File Upload Component */}
              <FileUpload
                files={newFiles}
                onFilesChange={setNewFiles}
                label={existingDocs && existingDocs.length > 0 ? "Add More Documents" : "Upload Documents"}
                instructions={`Upload additional documents. Maximum file size: ${MAX_FILE_SIZE / 1024 / 1024}MB.`}
                disabled={loading}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  color: '#374151',
                  background: '#ffffff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !title.trim()}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: '500',
                  color: '#ffffff',
                  background: loading || !title.trim() ? '#94a3b8' : '#1e293b',
                  cursor: loading || !title.trim() ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {loading ? 'Updating...' : 'Update Event'}
              </button>
            </div>
          </form>
        </LocalizationProvider>
      </div>
    </div>
  );
}

