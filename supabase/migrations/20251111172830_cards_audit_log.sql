-- ============================================================================
-- Cards Audit Log
-- Tracks moderation actions performed against cards.
-- ============================================================================

create table if not exists cards_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  card_id uuid not null,
  action text not null check (action in ('deactivated', 'reactivated', 'updated')),
  actor_id uuid not null,
  reason text,
  payload_before jsonb,
  payload_after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cards_audit_log_event_created
  on cards_audit_log(event_id, created_at desc);

create index if not exists idx_cards_audit_log_card
  on cards_audit_log(card_id, created_at desc);

alter table cards_audit_log enable row level security;

create policy cards_audit_log_owner_read
  on cards_audit_log
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = cards_audit_log.event_id
        and e.owner_uid = auth.uid()
    )
  );

create policy cards_audit_log_owner_insert
  on cards_audit_log
  for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = cards_audit_log.event_id
        and e.owner_uid = auth.uid()
    )
  );

comment on table cards_audit_log is 'Audit log of moderation actions performed on cards.';
comment on column cards_audit_log.payload_before is 'Snapshot of the card payload before the action (optional).';
comment on column cards_audit_log.payload_after is 'Snapshot of the card payload after the action (optional).';




