-- Migration: Add regeneration statuses to agents table
-- Allows regenerating specific stages of context generation without regenerating the entire blueprint
-- Generated: 2024-11-04

-- Drop existing constraint
alter table agents
  drop constraint if exists agents_status_check;

-- Add new constraint with all statuses (existing + regeneration statuses)
alter table agents
  add constraint agents_status_check
  check (status in (
    -- Context generation statuses
    'idle',                    -- Agent created but context generation not started
    'blueprint_generating',    -- Generating context blueprint
    'blueprint_ready',         -- Blueprint generated, awaiting user approval
    'blueprint_approved',      -- User approved, research starting
    'researching',             -- Executing deep research plan
    'building_glossary',       -- Constructing glossary knowledge base
    'building_chunks',         -- Constructing vector database chunks
    'context_complete',        -- Context generation complete (equivalent to 'ready')
    -- Regeneration statuses (allow regenerating specific stages)
    'regenerating_research',   -- Regenerating research stage only
    'regenerating_glossary',   -- Regenerating glossary stage only
    'regenerating_chunks',     -- Regenerating chunks stage only
    -- Legacy statuses (backward compatibility)
    'prepping',                -- Legacy: automatic context building
    'ready',                   -- Legacy: ready to start
    'running',                 -- Agent is running and processing transcripts
    'ended',                   -- Agent has ended
    'error'                    -- Agent encountered an error
  ));

-- Update comment to include regeneration statuses
comment on column agents.status is 'Agent status: idle -> blueprint_generating -> blueprint_ready -> blueprint_approved -> researching -> building_glossary -> building_chunks -> context_complete -> running. Regeneration: regenerating_research, regenerating_glossary, regenerating_chunks. Legacy: prepping -> ready -> running.';
