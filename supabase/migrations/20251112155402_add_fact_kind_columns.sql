-- Adds semantic classification metadata for facts
alter table public.facts
  add column if not exists fact_kind text default 'claim';

alter table public.facts
  alter column fact_kind set not null;

alter table public.facts
  add column if not exists original_fact_value jsonb;

alter table public.facts
  add column if not exists exclude_from_prompt boolean default false;

alter table public.facts
  alter column exclude_from_prompt set not null;

update public.facts
set fact_kind = coalesce(fact_kind, 'claim'),
    exclude_from_prompt = coalesce(exclude_from_prompt, false)
where true;

