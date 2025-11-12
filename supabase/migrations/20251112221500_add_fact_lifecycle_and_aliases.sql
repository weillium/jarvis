-- Migration: add lifecycle metadata columns and alias tracking for facts

-- Lifecycle timestamps allow the worker to persist dormant/pruned state across restarts.
alter table public.facts
  add column if not exists dormant_at timestamptz,
  add column if not exists pruned_at timestamptz;

create index if not exists facts_event_id_dormant_idx
  on public.facts (event_id, dormant_at);

create index if not exists facts_event_id_pruned_idx
  on public.facts (event_id, pruned_at);

comment on column facts.dormant_at is 'Timestamp when this fact was moved to dormant/low-priority state.';
comment on column facts.pruned_at is 'Timestamp when this fact was removed from active memory.';

-- Maintain alias mappings so new fact variants can reuse existing keys.
create table if not exists fact_key_aliases (
  event_id uuid not null references public.events(id) on delete cascade,
  canonical_key text not null,
  alias_key text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, alias_key)
);

create index if not exists fact_key_aliases_event_canonical_idx
  on fact_key_aliases (event_id, canonical_key);

comment on table fact_key_aliases is 'Stores alternate fact keys observed during extraction that should map to an existing canonical key.';
comment on column fact_key_aliases.canonical_key is 'Canonical fact key to reuse.';
comment on column fact_key_aliases.alias_key is 'Observed alias key that should be normalized to the canonical key.';

