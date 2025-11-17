-- Migration: Add 'superseded' status to context_blueprints
-- Allows tracking blueprints that have been replaced by newer versions

alter table context_blueprints
  drop constraint if exists context_blueprints_status_check;

alter table context_blueprints
  add constraint context_blueprints_status_check
  check (status in ('generating', 'ready', 'approved', 'superseded', 'error'));

comment on column context_blueprints.status is 'Blueprint status: generating -> ready -> approved. Superseded blueprints are replaced by newer versions. Execution status tracked via agent status and generation_cycles.';

