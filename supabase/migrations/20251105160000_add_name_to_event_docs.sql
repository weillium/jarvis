-- ============================================================================
-- Add name field to event_docs table
-- Allows storing custom document names (defaults to original filename)
-- ============================================================================

-- Add name column to event_docs table
alter table event_docs
  add column if not exists name text;

-- Update existing records to extract filename from path
-- Path format: eventId/timestamp-random.ext
-- We'll extract the filename part (everything after the last slash)
update event_docs
set name = substring(path from '[^/]+$')
where name is null;

-- Set name as NOT NULL with a default (for new inserts)
-- For now, we'll allow NULL but ensure it's always set on insert
-- The application will handle setting the name based on the original filename

-- Add comment
comment on column event_docs.name is 'Custom display name for the document. Defaults to original filename if not specified.';

