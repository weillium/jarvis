-- Migration: Add glossary_terms table
-- Stores glossary terms, acronyms, and definitions for fast lookup during live events
-- Generated: 2024-11-03

create table if not exists glossary_terms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  
  -- Term definition
  term text not null,
  definition text not null,
  acronym_for text, -- If term is an acronym, what it stands for (e.g., "API" stands for "Application Programming Interface")
  
  -- Categorization
  category text, -- e.g., 'technical', 'business', 'domain-specific', 'acronym'
  
  -- Usage context
  usage_examples text[], -- Example sentences or phrases using the term
  related_terms text[], -- Related terms that might be mentioned together
  
  -- Quality and source
  confidence_score float check (confidence_score >= 0 and confidence_score <= 1), -- 0-1, how confident we are in this definition
  source text, -- Where this came from: 'exa', 'document', 'llm_generation', 'wikipedia'
  source_url text, -- If from web source, the URL
  
  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for efficient lookup
create index if not exists idx_glossary_terms_event on glossary_terms(event_id);
create index if not exists idx_glossary_terms_term on glossary_terms(event_id, term);
create index if not exists idx_glossary_terms_category on glossary_terms(event_id, category);
create index if not exists idx_glossary_terms_confidence on glossary_terms(event_id, confidence_score desc);

-- Unique constraint: one definition per term per event (can update if better definition found)
create unique index if not exists idx_glossary_terms_unique on glossary_terms(event_id, lower(term));

-- Comments for documentation
comment on table glossary_terms is 'Glossary of terms, acronyms, and definitions for fast lookup during live events';
comment on column glossary_terms.acronym_for is 'If the term is an acronym, this field contains what it stands for';
comment on column glossary_terms.confidence_score is 'Quality score 0-1 indicating confidence in the definition accuracy';
comment on column glossary_terms.usage_examples is 'Example sentences showing how the term is used in context';

