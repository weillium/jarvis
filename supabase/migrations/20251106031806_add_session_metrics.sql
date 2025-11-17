-- ============================================================================
-- Add Aggregate Metrics to Agent Sessions
-- ============================================================================
-- Stores final token metrics and runtime stats when sessions are closed
-- Enables hybrid approach: real-time metrics via SSE during active sessions,
-- historical metrics from DB for closed sessions

alter table agent_sessions
  add column if not exists token_metrics jsonb,
  add column if not exists runtime_stats jsonb,
  add column if not exists metrics_recorded_at timestamptz;

-- Index for querying sessions with metrics
create index if not exists idx_agent_sessions_metrics_recorded
  on agent_sessions(metrics_recorded_at)
  where metrics_recorded_at is not null;

-- Comments
comment on column agent_sessions.token_metrics is 'Aggregate token usage metrics recorded when session closes: {total_tokens, request_count, max_tokens, avg_tokens, warnings, criticals, last_request}';
comment on column agent_sessions.runtime_stats is 'Runtime processing stats recorded when session closes: {cards_last_seq, facts_last_seq, facts_last_update, ring_buffer_stats, facts_store_stats}';
comment on column agent_sessions.metrics_recorded_at is 'Timestamp when aggregate metrics were recorded (set when session closes)';

