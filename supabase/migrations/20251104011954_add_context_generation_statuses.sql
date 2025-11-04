-- Migration: Add context generation statuses to agents table
-- Extends agent status enum to support new manual context generation workflow
-- Generated: 2025-01-04

-- Drop existing constraint
alter table agents
  drop constraint if exists agents_status_check;

-- Add new constraint with all statuses (old + new)
alter table agents
  add constraint agents_status_check
  check (status in (
    -- New context generation statuses
    'idle',                    -- Agent created but context generation not started
    'blueprint_generating',    -- Generating context blueprint
    'blueprint_ready',         -- Blueprint generated, awaiting user approval
    'blueprint_approved',      -- User approved, research starting
    'researching',             -- Executing deep research plan
    'building_glossary',        -- Constructing glossary knowledge base
    'building_chunks',         -- Constructing vector database chunks
    'context_complete',        -- Context generation complete (equivalent to 'ready')
    -- Legacy statuses (backward compatibility)
    'prepping',                -- Legacy: automatic context building
    'ready',                   -- Legacy: ready to start
    'running',                 -- Agent is running and processing transcripts
    'ended',                   -- Agent has ended
    'error'                    -- Agent encountered an error
  ));

-- Update default status to 'idle' for new agents (manual workflow)
-- Note: Existing agents keep their current status
alter table agents
  alter column status set default 'idle';

-- Add comment explaining the status flow
comment on column agents.status is 'Agent status: idle -> blueprint_generating -> blueprint_ready -> blueprint_approved -> researching -> building_glossary -> building_chunks -> context_complete -> running. Legacy: prepping -> ready -> running.';

