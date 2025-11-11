-- ============================================================================
-- Cards State Table Migration
-- ---------------------------------------------------------------------------
-- 1. Remove legacy cards artifacts (trigger, function, view, table)
-- 2. Create canonical cards state table (mirrors facts setup)
-- 3. Backfill data from agent_outputs (and any remaining legacy rows)
-- 4. Create indexes, triggers, and comments for documentation
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Drop legacy artifacts
-- ---------------------------------------------------------------------------

-- Drop compatibility trigger/function/view if they still exist
drop trigger if exists sync_cards_trigger on cards;
drop function if exists sync_cards_to_agent_outputs();
drop view if exists cards_view;

-- Rename legacy table to stage data for backfill
alter table if exists cards rename to cards_legacy;

-- ---------------------------------------------------------------------------
-- Step 2: Create canonical cards table (mirrors facts setup)
-- ---------------------------------------------------------------------------

create table if not exists cards (
  event_id uuid not null references events(id) on delete cascade,
  card_id uuid not null,
  card_kind text,
  card_type text,
  payload jsonb not null,
  source_seq bigint,
  last_seen_seq bigint not null default 0,
  sources int[] default array[]::int[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, card_id)
);

-- Indexes mirroring facts table usage patterns
create index if not exists idx_cards_event on cards(event_id);
create index if not exists idx_cards_event_active
  on cards(event_id, is_active)
  where is_active = true;
create index if not exists idx_cards_last_seen_seq
  on cards(event_id, last_seen_seq);

-- Ensure updated_at stays in sync with mutations
create trigger update_cards_updated_at
  before update on cards
  for each row
  execute function update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Step 3: Backfill cards data from agent_outputs (primary source of truth)
-- ---------------------------------------------------------------------------

with
card_outputs as (
  select
    ao.event_id,
    ao.id as card_id,
    ao.payload->>'kind' as card_kind,
    ao.payload->>'card_type' as card_type,
    ao.payload,
    case
      when (ao.payload->>'source_seq') ~ '^\d+$' then (ao.payload->>'source_seq')::bigint
      else null
    end as source_seq,
    ao.for_seq,
    ao.created_at
  from agent_outputs ao
  where ao.agent_type = 'cards'
    and ao.type = 'card'
)
insert into cards (
  event_id,
  card_id,
  card_kind,
  card_type,
  payload,
  source_seq,
  last_seen_seq,
  sources,
  is_active,
  created_at,
  updated_at
)
select
  co.event_id,
  co.card_id,
  co.card_kind,
  co.card_type,
  co.payload,
  co.source_seq,
  coalesce(co.for_seq, co.source_seq, 0) as last_seen_seq,
  case
    when co.for_seq is not null then array[co.for_seq::int]
    when co.source_seq is not null then array[co.source_seq::int]
    else array[]::int[]
  end as sources,
  true as is_active,
  co.created_at,
  co.created_at
from card_outputs co
on conflict (event_id, card_id) do nothing;

-- Backfill any lingering legacy rows that never made it into agent_outputs
with legacy_cards as (
  select
    cl.event_id,
    cl.id as card_id,
    cl.payload->>'kind' as card_kind,
    cl.payload->>'card_type' as card_type,
    cl.payload,
    case
      when (cl.payload->>'source_seq') ~ '^\d+$' then (cl.payload->>'source_seq')::bigint
      else null
    end as source_seq,
    cl.emitted_at
  from cards_legacy cl
)
insert into cards (
  event_id,
  card_id,
  card_kind,
  card_type,
  payload,
  source_seq,
  last_seen_seq,
  sources,
  is_active,
  created_at,
  updated_at
)
select
  lc.event_id,
  lc.card_id,
  lc.card_kind,
  lc.card_type,
  lc.payload,
  lc.source_seq,
  coalesce(lc.source_seq, 0) as last_seen_seq,
  case
    when lc.source_seq is not null
      then array[lc.source_seq::int]
    else array[]::int[]
  end as sources,
  true as is_active,
  coalesce(lc.emitted_at, now()),
  coalesce(lc.emitted_at, now())
from legacy_cards lc
left join cards c
  on c.event_id = lc.event_id
 and c.card_id = lc.card_id
where c.card_id is null;

-- ---------------------------------------------------------------------------
-- Step 4: Cleanup legacy table and document schema intent
-- ---------------------------------------------------------------------------

drop table if exists cards_legacy;

comment on table cards is 'Canonical state table for cards (one row per card with moderation support).';
comment on column cards.card_id is 'Stable identifier for the card (matches agent_outputs.id for card events).';
comment on column cards.last_seen_seq is 'Transcript sequence where the card was last observed/emitted.';
comment on column cards.sources is 'Transcript sequences contributing to this card (int array).';
comment on column cards.is_active is 'Moderation flag: FALSE when a card is deactivated.';


