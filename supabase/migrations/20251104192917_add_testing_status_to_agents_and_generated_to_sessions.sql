-- Migration: Add 'testing' status to agents and 'generated' status to agent_sessions
-- Enables new session management workflow: generate -> test -> confirm ready

-- Add 'testing' status to agents table
-- First, check what statuses currently exist by looking at the constraint
-- We'll add 'testing' to the existing list
alter table agents
  drop constraint if exists agents_status_check;

-- Add new constraint with 'testing' status included
-- Include all existing statuses from previous migrations
alter table agents
  add constraint agents_status_check
  check (status in (
    -- Context generation statuses
    'idle',                        -- Agent created but context generation not started
    'blueprint_generating',        -- Generating context blueprint
    'blueprint_ready',             -- Blueprint generated, awaiting user approval
    'blueprint_approved',         -- User approved, research starting
    'researching',                 -- Executing deep research plan
    'building_glossary',           -- Constructing glossary knowledge base
    'building_chunks',             -- Constructing vector database chunks
    'context_complete',            -- Context generation complete (equivalent to 'ready')
    -- Regeneration statuses (allow regenerating specific stages)
    'regenerating_research',       -- Regenerating research stage only
    'regenerating_glossary',       -- Regenerating glossary stage only
    'regenerating_chunks',         -- Regenerating chunks stage only
    -- Testing status (NEW)
    'testing',                     -- Sessions generated, ready for testing
    -- Legacy statuses (backward compatibility)
    'prepping',                    -- Legacy: automatic context building
    'ready',                       -- Legacy: ready to start
    'running',                     -- Agent is running and processing transcripts
    'ended',                       -- Agent has ended
    'error'                        -- Agent encountered an error
  ));

-- Add comment explaining the testing status
comment on column agents.status is 'Agent status: prepping (initial), idle (waiting), blueprint_* (blueprint generation), researching/building_* (context generation), context_complete (ready for testing), testing (sessions generated, testing), ready (approved for production), running (active), ended (completed), error (failed)';

-- Add 'generated' status to agent_sessions table
alter table agent_sessions
  drop constraint if exists agent_sessions_status_check;

alter table agent_sessions
  add constraint agent_sessions_status_check
  check (status in ('generated', 'starting', 'active', 'paused', 'closed', 'error'));

-- Update comment for agent_sessions status
comment on column agent_sessions.status is 'Session status: generated (created but not started), starting (connecting), active (operational), paused (closed but state preserved for resume), closed (permanently ended), error (failed)';

