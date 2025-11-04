'use client';

import { useState, FormEvent, useEffect } from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '@/shared/lib/supabase/client';
import { MarkdownEditor } from '@/shared/ui/markdown-editor';
import { FileUpload } from '@/shared/ui/file-upload';

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

export function CreateEventModal({ isOpen, onClose, onSuccess }: CreateEventModalProps) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get list of common timezones
  const timezones = Intl.supportedValuesOf('timeZone').sort();

  // Auto-set end date to 1 hour after start date when start date changes
  useEffect(() => {
    if (startDate) {
      const oneHourLater = startDate.add(1, 'hour');
      setEndDate(oneHourLater);
    }
  }, [startDate]);

  if (!isOpen) return null;


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Get current user
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.user) {
        throw new Error('You must be logged in to create an event');
      }

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

      // Prepare event data
      const eventData: EventData = {
        owner_uid: session.user.id,
        title: title.trim(),
      };

      // Add optional fields if provided
      if (topic.trim()) {
        eventData.topic = topic.trim();
      }

      // Convert dates to UTC timestamps
      if (startDate) {
        // Format the date/time as a string and interpret it as being in the selected timezone
        const dateString = startDate.format('YYYY-MM-DD HH:mm:ss');
        const dateInTimezone = dayjs.tz(dateString, timezone);
        eventData.start_time = dateInTimezone.utc().toISOString();
      }

      if (endDate) {
        // Format the date/time as a string and interpret it as being in the selected timezone
        const dateString = endDate.format('YYYY-MM-DD HH:mm:ss');
        const dateInTimezone = dayjs.tz(dateString, timezone);
        eventData.end_time = dateInTimezone.utc().toISOString();
      }

      // Call Orchestrator Edge Function to create event and agent
      console.log('Calling orchestrator to create event...');
      
      // Add timeout wrapper to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
      });
      
      const invokePromise = supabase.functions.invoke('orchestrator', {
        body: {
          action: 'create_event_and_agent',
          payload: {
            owner_uid: session.user.id,
            title: title.trim(),
            topic: topic.trim() || null,
            start_time: eventData.start_time || null,
            end_time: eventData.end_time || null,
          },
        },
      });

      const { data: orchestratorResult, error: orchestratorError } = await Promise.race([
        invokePromise,
        timeoutPromise,
      ]) as { data: any; error: any };

      console.log('Orchestrator response:', { orchestratorResult, orchestratorError });

      if (orchestratorError) {
        console.error('Orchestrator error:', orchestratorError);
        throw orchestratorError;
      }

      if (!orchestratorResult?.ok || !orchestratorResult?.event) {
        console.error('Orchestrator returned invalid response:', orchestratorResult);
        throw new Error(orchestratorResult?.error || 'Failed to create event');
      }

      // Extract event from orchestrator response
      const eventResult = orchestratorResult.event;
      console.log('Event created successfully:', eventResult.id);

      // Upload files to Supabase storage and create event_docs records
      if (files.length > 0) {
        // Verify the event is accessible (helps with RLS policy checks)
        const { error: verifyError } = await supabase
          .from('events')
          .select('id')
          .eq('id', eventResult.id)
          .single();

        if (verifyError) {
          throw new Error(`Cannot verify event ownership: ${verifyError.message}`);
        }

        const uploadPromises = files.map(async (file) => {
          // Generate a unique path for the file
          const fileExt = file.name.split('.').pop();
          const fileName = `${eventResult.id}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
          const filePath = fileName;

          // Upload to Supabase storage
          const { error: uploadError, data: uploadData } = await supabase.storage
            .from('event-docs')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            console.error('Storage upload error:', uploadError);
            throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
          }

          // Create event_docs record
          const { error: docError } = await supabase
            .from('event_docs')
            .insert([
              {
                event_id: eventResult.id,
                path: filePath,
              },
            ]);

          if (docError) {
            console.error('Event docs insert error:', docError);
            // If database insert fails but upload succeeded, try to clean up the file
            if (uploadData?.path) {
              await supabase.storage.from('event-docs').remove([uploadData.path]);
            }
            throw new Error(`Failed to create document record for ${file.name}: ${docError.message}`);
          }
        });

        await Promise.all(uploadPromises);
      }

      // Reset form and close modal
      setTitle('');
      setTopic('');
      setStartDate(null);
      setEndDate(null);
      setFiles([]);
      onClose();
      
      // Trigger success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error('Error creating event:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create event';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTitle('');
      setTopic('');
      setStartDate(null);
      setEndDate(null);
      setFiles([]);
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
            Create New Event
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
                  htmlFor="title"
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
                  id="title"
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
                  htmlFor="timezone"
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
                  id="timezone"
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
                    appearance: 'none',
                    backgroundImage: loading
                      ? 'none'
                      : `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    paddingRight: '40px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
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
                  htmlFor="start_time"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Start Time <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <DateTimePicker
                  value={startDate}
                  onChange={(newValue) => setStartDate(newValue)}
                  disabled={loading}
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
              </div>

              <div style={{ width: '100%', boxSizing: 'border-box' }}>
                <label
                  htmlFor="end_time"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  End Time <span style={{ color: '#ef4444' }}>*</span>
                  {startDate && endDate && (
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '400', marginLeft: '8px' }}>
                      (auto-set to 1 hour after start)
                    </span>
                  )}
                </label>
                <DateTimePicker
                  value={endDate}
                  onChange={(newValue) => setEndDate(newValue)}
                  disabled={loading || !startDate}
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

            <div style={{ marginBottom: '24px', width: '100%', boxSizing: 'border-box' }}>
              <FileUpload
                files={files}
                onFilesChange={setFiles}
                label="Event Documents"
                instructions="Upload documents related to this event. You can select multiple files at once."
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
              {loading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
          </form>
        </LocalizationProvider>
      </div>
    </div>
  );
}
