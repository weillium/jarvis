-- Enable Row Level Security on events and event_docs tables
alter table events enable row level security;
alter table event_docs enable row level security;

-- Events policies
-- Allow authenticated users to insert events where they are the owner
create policy "Users can insert their own events"
  on events
  for insert
  to authenticated
  with check (auth.uid() = owner_uid);

-- Allow authenticated users to select events they own
create policy "Users can select their own events"
  on events
  for select
  to authenticated
  using (auth.uid() = owner_uid);

-- Allow authenticated users to update events they own
create policy "Users can update their own events"
  on events
  for update
  to authenticated
  using (auth.uid() = owner_uid)
  with check (auth.uid() = owner_uid);

-- Allow authenticated users to delete events they own
create policy "Users can delete their own events"
  on events
  for delete
  to authenticated
  using (auth.uid() = owner_uid);

-- Event_docs policies
-- Allow authenticated users to insert event_docs for events they own
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

-- Allow authenticated users to select event_docs for events they own
create policy "Users can select event_docs for their own events"
  on event_docs
  for select
  to authenticated
  using (
    exists (
      select 1 from events
      where events.id = event_docs.event_id
      and events.owner_uid = auth.uid()
    )
  );

-- Allow authenticated users to delete event_docs for events they own
create policy "Users can delete event_docs for their own events"
  on event_docs
  for delete
  to authenticated
  using (
    exists (
      select 1 from events
      where events.id = event_docs.event_id
      and events.owner_uid = auth.uid()
    )
  );

-- Storage bucket policies for event-docs
-- First, ensure the bucket exists (idempotent - won't error if it already exists)
-- Note: Bucket creation requires service_role, so this might need to be run manually in dashboard
-- Or ensure service_role permissions for this migration
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('event-docs', 'event-docs', false, 52428800, null)
  on conflict (id) do nothing;
exception when others then
  -- Bucket might already exist, continue
  null;
end $$;

-- Note: RLS is already enabled on storage.objects by Supabase by default
-- We don't need to alter it - we can just create policies

-- Drop ALL existing policies on storage.objects for event-docs bucket (to avoid conflicts)
-- We need to drop by checking the policy definition or recreate
do $$
declare
  r record;
begin
  for r in (
    select policyname from pg_policies 
    where schemaname = 'storage' 
    and tablename = 'objects'
    and policyname like '%event%'
  ) loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- Allow authenticated users to upload files to event-docs bucket for their own events
-- File paths are structured as: {event_id}/{filename}
-- Extract the first part of the path (event_id) and verify it belongs to the user
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

-- Allow authenticated users to view files in their own event folders
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

-- Allow authenticated users to update files in their own event folders
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

-- Allow authenticated users to delete files in their own event folders
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

