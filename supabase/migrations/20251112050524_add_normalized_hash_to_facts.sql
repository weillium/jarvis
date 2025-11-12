-- Adds normalized_hash column to facts table for value deduplication
alter table public.facts
  add column if not exists normalized_hash text;

create index if not exists facts_event_id_normalized_hash_idx
  on public.facts (event_id, normalized_hash);

