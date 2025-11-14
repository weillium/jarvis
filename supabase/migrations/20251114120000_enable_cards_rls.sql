-- ============================================================================
-- Cards RLS and Policies
-- Ensures only event owners can access or modify their cards.
-- ============================================================================

alter table cards enable row level security;

create policy cards_owner_select
  on cards
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = cards.event_id
        and e.owner_uid = auth.uid()
    )
  );

create policy cards_owner_update
  on cards
  for update
  using (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = cards.event_id
        and e.owner_uid = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = cards.event_id
        and e.owner_uid = auth.uid()
    )
  );

create policy cards_owner_insert
  on cards
  for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = cards.event_id
        and e.owner_uid = auth.uid()
    )
  );

create policy cards_owner_delete
  on cards
  for delete
  using (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = cards.event_id
        and e.owner_uid = auth.uid()
    )
  );

comment on policy cards_owner_select on cards is 'Allow event owners to read their cards.';
comment on policy cards_owner_update on cards is 'Allow event owners to update card moderation state.';
comment on policy cards_owner_insert on cards is 'Allow event owners to insert cards manually if needed (workers bypass via service role).';
comment on policy cards_owner_delete on cards is 'Allow event owners to delete cards they own.';
