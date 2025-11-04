-- Add is_live column to events table for tracking active events
-- This enables the orchestrator to identify which events are currently running

alter table events
  add column if not exists is_live boolean default false;

-- Create index for efficient queries on live events
create index if not exists idx_events_is_live
  on events(is_live)
  where is_live = true;

comment on column events.is_live is 'Whether this event is currently live and processing transcripts';

