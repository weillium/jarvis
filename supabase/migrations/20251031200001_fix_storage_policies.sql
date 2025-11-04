-- This migration fixes potential issues with storage and event_docs policies
-- Run this if the previous migration didn't work

-- Ensure bucket exists (run this manually in dashboard if it fails due to permissions)
-- The bucket should be created via Supabase Dashboard > Storage > New bucket
-- Name: event-docs, Public: false

-- Note: RLS is already enabled on storage.objects by Supabase
-- We can only create policies, not alter the table itself

-- Drop and recreate storage policies with better error handling
do $$
begin
  -- Drop existing policies
  drop policy if exists "Users can upload to their own event folders" on storage.objects;
  drop policy if exists "Users can view files in their own event folders" on storage.objects;
  drop policy if exists "Users can update files in their own event folders" on storage.objects;
  drop policy if exists "Users can delete files in their own event folders" on storage.objects;
exception when others then
  -- Continue if policies don't exist
  null;
end $$;

-- Create storage policies
-- Allow authenticated users to upload files to event-docs bucket for their own events
create policy "Users can upload to their own event folders"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'event-docs' and
    exists (
      select 1 from events
      where events.id::text = split_part(name, '/', 1)
      and events.owner_uid = auth.uid()
    )
  );

create policy "Users can view files in their own event folders"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'event-docs' and
    exists (
      select 1 from events
      where events.id::text = split_part(name, '/', 1)
      and events.owner_uid = auth.uid()
    )
  );

create policy "Users can update files in their own event folders"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'event-docs' and
    exists (
      select 1 from events
      where events.id::text = split_part(name, '/', 1)
      and events.owner_uid = auth.uid()
    )
  );

create policy "Users can delete files in their own event folders"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'event-docs' and
    exists (
      select 1 from events
      where events.id::text = split_part(name, '/', 1)
      and events.owner_uid = auth.uid()
    )
  );

-- Ensure event_docs policies allow the SELECT needed for EXISTS checks
-- The SELECT policy should already allow this, but let's make sure
drop policy if exists "Users can insert event_docs for their own events" on event_docs;
create policy "Users can insert event_docs for their own events"
  on event_docs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from events
      where events.id = event_docs.event_id
      and events.owner_uid = auth.uid()
    )
  );

