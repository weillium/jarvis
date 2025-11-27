-- ============================================================================
-- Facts Audit Log
-- Tracks moderation actions performed against facts.
-- ============================================================================

create table if not exists facts_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  fact_key text not null,
  action text not null check (action in ('deactivated', 'reactivated', 'updated')),
  actor_id uuid not null,
  reason text,
  payload_before jsonb,
  payload_after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_facts_audit_log_event_created
  on facts_audit_log(event_id, created_at desc);

create index if not exists idx_facts_audit_log_fact
  on facts_audit_log(event_id, fact_key, created_at desc);

alter table facts_audit_log enable row level security;

create policy facts_audit_log_owner_read
  on facts_audit_log
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = facts_audit_log.event_id
        and e.owner_uid = auth.uid()
    )
  );

create policy facts_audit_log_owner_insert
  on facts_audit_log
  for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from events e
      where e.id = facts_audit_log.event_id
        and e.owner_uid = auth.uid()
    )
  );

comment on table facts_audit_log is 'Audit log of moderation actions performed on facts.';
comment on column facts_audit_log.payload_before is 'Snapshot of the fact payload before the action (optional).';
comment on column facts_audit_log.payload_after is 'Snapshot of the fact payload after the action (optional).';

