-- Adds semantic fingerprint and triple metadata fields to facts
alter table public.facts
  add column if not exists fingerprint_hash text;

alter table public.facts
  add column if not exists fact_subject text;

alter table public.facts
  add column if not exists fact_predicate text;

alter table public.facts
  add column if not exists fact_objects text[];

create index if not exists facts_event_id_fingerprint_idx
  on public.facts (event_id, fingerprint_hash);

