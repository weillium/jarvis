-- Migration: Remove version and parent_cycle_id from generation_cycles
-- These fields were part of an over-engineered versioning system that was simplified
-- Versioning is now handled via generation_cycles table structure itself (each cycle represents a version)

-- Drop legacy versioning columns from generation_cycles
alter table generation_cycles
  drop column if exists version,
  drop column if exists parent_cycle_id;

-- Update comment
comment on table generation_cycles is 'Tracks generation cycles. Each cycle represents a version of a generation phase. Use created_at and cycle_type to track version history.';

