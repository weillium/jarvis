-- Migration: Add merge provenance tracking to facts table
-- Adds merge_provenance (text array) and merged_at timestamp columns.

alter table facts
  add column if not exists merge_provenance text[] default array[]::text[];

alter table facts
  add column if not exists merged_at timestamptz;

comment on column facts.merge_provenance is 'Original fact keys that were merged into this fact (for provenance/auditing).';

comment on column facts.merged_at is 'Timestamp of the most recent merge that produced this fact (null if never merged).';

