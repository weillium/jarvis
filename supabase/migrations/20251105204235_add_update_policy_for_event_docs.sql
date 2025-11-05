-- Add UPDATE policy for event_docs table
-- Allows authenticated users to update event_docs for events they own
-- ============================================================================

-- Allow authenticated users to update event_docs for events they own
create policy "Users can update event_docs for their own events"
  on event_docs
  for update
  to authenticated
  using (
    exists (
      select 1 from events
      where events.id = event_docs.event_id
      and events.owner_uid = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from events
      where events.id = event_docs.event_id
      and events.owner_uid = auth.uid()
    )
  );

