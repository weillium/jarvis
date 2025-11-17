-- Add 'transcript' agent type to all agent_type check constraints
-- This enables a third agent type for transcript processing

-- Update agent_sessions table
alter table agent_sessions
  drop constraint if exists agent_sessions_agent_type_check;

alter table agent_sessions
  add constraint agent_sessions_agent_type_check
  check (agent_type in ('transcript', 'cards', 'facts'));

-- Update checkpoints table
alter table checkpoints
  drop constraint if exists checkpoints_agent_type_check;

alter table checkpoints
  add constraint checkpoints_agent_type_check
  check (agent_type in ('transcript', 'cards', 'facts'));

-- Update agent_outputs table
alter table agent_outputs
  drop constraint if exists agent_outputs_agent_type_check;

alter table agent_outputs
  add constraint agent_outputs_agent_type_check
  check (agent_type in ('transcript', 'cards', 'facts'));

-- Update agent_sessions_history table
alter table agent_sessions_history
  drop constraint if exists agent_sessions_history_agent_type_check;

alter table agent_sessions_history
  add constraint agent_sessions_history_agent_type_check
  check (agent_type in ('transcript', 'cards', 'facts'));

-- Update comments
comment on column agent_sessions.agent_type is 'Type of agent: "transcript", "cards", or "facts"';
comment on column checkpoints.agent_type is 'Type of agent: "transcript", "cards", or "facts"';
comment on column agent_outputs.agent_type is 'Type of agent: "transcript", "cards", or "facts"';

