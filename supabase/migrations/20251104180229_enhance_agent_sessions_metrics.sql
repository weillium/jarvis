-- Migration: Enhance agent_sessions table with metrics column
-- Generated: 2025-11-04
-- Purpose: Add JSONB column to store detailed session metrics for historical analysis and debugging

-- ============================================================================
-- ADD METRICS COLUMN TO AGENT_SESSIONS
-- ============================================================================
-- Stores detailed session metrics: token usage, runtime stats, recent logs
-- This enables historical analysis and debugging without requiring real-time access

alter table agent_sessions
  add column if not exists metrics jsonb default '{}'::jsonb;

-- Index for querying by metrics (GIN index for efficient JSONB queries)
create index if not exists idx_agent_sessions_metrics
  on agent_sessions using gin (metrics);

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

comment on column agent_sessions.metrics is 'Stores detailed session metrics: token usage, runtime stats, recent logs. Structure: { token_metrics: {...}, runtime: {...}, recent_logs: [...], ... }';

