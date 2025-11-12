-- Migration: Add merge provenance metadata to facts table
-- Adds columns for tracking merged fact provenance and timestamp.

alter table facts
  add column if not exists merge_provenance text[] default array[]::text[];

alter table facts
  add column if not exists merged_at timestamptz;

comment on column facts.merge_provenance is 'Original fact keys that were merged into this fact.';
comment on column facts.merged_at is 'Timestamp when this fact was produced via a merge operation.';

