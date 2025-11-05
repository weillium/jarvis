-- Migration: Remove legacy versioning fields from context_blueprints
-- These fields were part of an over-engineered versioning system that was simplified
-- Versioning is now handled via status field ('superseded') and superseded_at timestamp

-- Drop legacy versioning columns from context_blueprints
alter table context_blueprints
  drop column if exists version,
  drop column if exists parent_version_id,
  drop column if exists is_active,
  drop column if exists replaced_by;

-- Drop execution tracking columns (execution is tracked via generation_cycles and agent status)
alter table context_blueprints
  drop column if exists execution_started_at,
  drop column if exists completed_at;

-- Update comment
comment on column context_blueprints.status is 'Blueprint status: generating -> ready -> approved -> superseded. Execution status tracked via agent status and generation_cycles.';

