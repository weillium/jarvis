-- Migration: add agent utility metadata to glossary terms
-- Ensures each glossary entry records which downstream agents benefit

alter table glossary_terms
  add column if not exists agent_utility text[] default '{}'::text[];

comment on column glossary_terms.agent_utility is 'List of downstream agents (e.g. facts, cards) that this term supports.';

