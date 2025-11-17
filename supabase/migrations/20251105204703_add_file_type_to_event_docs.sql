-- Add file_type column to event_docs table
-- Stores the file type category (pdf, document, image, spreadsheet, presentation, archive, other)
-- ============================================================================

-- Add file_type column
alter table event_docs
  add column if not exists file_type text;

-- Function to determine file type from extension
create or replace function get_file_type_from_path(path text)
returns text as $$
declare
  ext text;
begin
  -- Extract extension (everything after the last dot)
  ext := lower(substring(path from '\.([^.]+)$'));
  
  -- Map extension to file type
  case ext
    when 'pdf' then return 'pdf';
    when 'doc', 'docx', 'txt', 'rtf', 'odt' then return 'document';
    when 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp' then return 'image';
    when 'xls', 'xlsx', 'csv', 'ods' then return 'spreadsheet';
    when 'ppt', 'pptx', 'odp' then return 'presentation';
    when 'zip', 'rar', '7z', 'tar', 'gz' then return 'archive';
    else return 'other';
  end case;
end;
$$ language plpgsql;

-- Update existing records to populate file_type from path
update event_docs
set file_type = get_file_type_from_path(path)
where file_type is null;

-- Set file_type as NOT NULL with default for new inserts
alter table event_docs
  alter column file_type set not null,
  alter column file_type set default 'other';

-- Add comment
comment on column event_docs.file_type is 'File type category: pdf, document, image, spreadsheet, presentation, archive, or other';

-- Drop the helper function (no longer needed after migration)
drop function if exists get_file_type_from_path(text);

