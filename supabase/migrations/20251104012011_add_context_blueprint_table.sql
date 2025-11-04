-- Migration: Add context_blueprints table
-- Stores context generation blueprints for user review and approval
-- Generated: 2024-11-03

create table if not exists context_blueprints (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  agent_id uuid references agents(id) on delete cascade not null,
  
  -- Blueprint status
  status text check (status in ('generating', 'ready', 'approved', 'executing', 'completed', 'error')) default 'generating',
  
  -- Full blueprint content (JSONB for flexibility)
  blueprint jsonb not null,
  
  -- Extracted important details (cleaned and structured)
  important_details text[],
  
  -- Inferred topics and terms
  inferred_topics text[],
  key_terms text[],
  
  -- Research plan
  research_plan jsonb,
  research_apis text[], -- e.g., ['exa', 'wikipedia']
  research_search_count int, -- Number of searches planned
  estimated_cost numeric(10, 4), -- Estimated cost in USD
  
  -- Construction plan
  glossary_plan jsonb,
  chunks_plan jsonb,
  target_chunk_count int, -- Target number of chunks (500 or 1000)
  quality_tier text check (quality_tier in ('basic', 'comprehensive')) default 'comprehensive',
  
  -- Metadata
  created_at timestamptz default now(),
  approved_at timestamptz,
  execution_started_at timestamptz,
  completed_at timestamptz,
  error_message text
);

-- Indexes for efficient querying
create index if not exists idx_context_blueprints_event on context_blueprints(event_id);
create index if not exists idx_context_blueprints_agent on context_blueprints(agent_id);
create index if not exists idx_context_blueprints_status on context_blueprints(status);
create index if not exists idx_context_blueprints_created on context_blueprints(created_at desc);

-- Comments for documentation
comment on table context_blueprints is 'Stores context generation blueprints for user review before execution';
comment on column context_blueprints.blueprint is 'Full blueprint JSON with all planning details';
comment on column context_blueprints.research_plan is 'Research plan with queries and API selections';
comment on column context_blueprints.estimated_cost is 'Estimated cost in USD for context generation';
comment on column context_blueprints.quality_tier is 'Quality tier: basic (500 chunks) or comprehensive (1000 chunks)';

