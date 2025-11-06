-- Add model column to agent_sessions table
-- Stores the OpenAI model used for the Realtime API session

alter table agent_sessions
  add column if not exists model text;

comment on column agent_sessions.model is 'OpenAI model used for this Realtime API session (e.g., gpt-4o-realtime-preview-2024-10-01)';




