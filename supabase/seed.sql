-- Seed demo user into auth.users (works locally)
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'demo@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

-- Event 1: New workflow (manual context generation)
insert into events (owner_uid, title, topic, start_time)
values
  ('00000000-0000-0000-0000-000000000000', 'Demo Event - New Workflow', 'AI Context Agents and Deep Research', now() + interval '5 minutes');

-- Agent for Event 1 with new 'idle' status (manual context generation)
insert into agents (event_id, status)
select id, 'idle' from events where title = 'Demo Event - New Workflow';

-- Example context blueprint for Event 1 (ready for approval)
insert into context_blueprints (
  event_id,
  agent_id,
  status,
  blueprint,
  important_details,
  inferred_topics,
  key_terms,
  research_plan,
  research_apis,
  research_search_count,
  estimated_cost,
  glossary_plan,
  chunks_plan,
  target_chunk_count,
  quality_tier
)
select 
  e.id,
  a.id,
  'ready',
  jsonb_build_object(
    'important_details', ARRAY['AI-powered contextual agents', 'Real-time event processing', 'Vector embeddings for semantic search'],
    'inferred_topics', ARRAY['Machine Learning', 'Natural Language Processing', 'Vector Databases', 'Real-time Systems'],
    'key_terms', ARRAY['LLM', 'Embedding', 'Vector Search', 'Semantic Search', 'Context Generation'],
    'research_plan', jsonb_build_object(
      'queries', ARRAY['AI contextual agents', 'vector embeddings for NLP', 'real-time event processing'],
      'apis', ARRAY['exa'],
      'search_count', 3,
      'estimated_cost', 0.15
    ),
    'glossary_plan', jsonb_build_object(
      'target_terms', ARRAY['LLM', 'Embedding', 'Vector Search', 'Semantic Search', 'Context Generation'],
      'categories', ARRAY['technical', 'domain-specific'],
      'estimated_count', 5
    ),
    'chunks_plan', jsonb_build_object(
      'target_count', 500,
      'sources', ARRAY['exa', 'llm_generation'],
      'ranking_strategy', 'quality_and_relevance'
    )
  ),
  ARRAY['AI-powered contextual agents', 'Real-time event processing'],
  ARRAY['Machine Learning', 'Natural Language Processing', 'Vector Databases'],
  ARRAY['LLM', 'Embedding', 'Vector Search', 'Semantic Search'],
  jsonb_build_object(
    'queries', ARRAY['AI contextual agents', 'vector embeddings for NLP', 'real-time event processing'],
    'apis', ARRAY['exa'],
    'search_count', 3,
    'estimated_cost', 0.15
  ),
  ARRAY['exa'],
  3,
  0.15,
  jsonb_build_object(
    'target_terms', ARRAY['LLM', 'Embedding', 'Vector Search', 'Semantic Search'],
    'categories', ARRAY['technical', 'domain-specific'],
    'estimated_count', 5
  ),
  jsonb_build_object(
    'target_count', 500,
    'sources', ARRAY['exa', 'llm_generation'],
    'ranking_strategy', 'quality_and_relevance'
  ),
  500,
  'basic'
from events e
join agents a on a.event_id = e.id
where e.title = 'Demo Event - New Workflow' and a.status = 'idle';

-- Example glossary terms for Event 1
insert into glossary_terms (event_id, term, definition, category, confidence_score, source)
select 
  e.id,
  term_data.term,
  term_data.definition,
  term_data.category,
  0.9,
  'llm_generation'
from events e,
(values
  ('LLM', 'Large Language Model - A type of AI model that processes and generates human-like text', 'technical'),
  ('Embedding', 'A numerical representation of text that captures semantic meaning in a high-dimensional vector space', 'technical'),
  ('Vector Search', 'A search method that finds similar content by comparing numerical vectors using cosine similarity', 'technical'),
  ('Semantic Search', 'Search that understands the meaning and context of queries rather than just matching keywords', 'technical'),
  ('Context Generation', 'The process of creating relevant background information and knowledge bases for AI agents', 'domain-specific')
) as term_data(term, definition, category)
where e.title = 'Demo Event - New Workflow'
on conflict (event_id, lower(term)) do update
set 
  definition = excluded.definition,
  category = excluded.category,
  confidence_score = excluded.confidence_score,
  source = excluded.source,
  updated_at = now();

-- Example context items with ranking for Event 1
insert into context_items (event_id, source, chunk, enrichment_source, chunk_size, rank, research_source, quality_score)
select 
  e.id,
  'topic_prep',
  chunk_data.chunk,
  'llm_generation',
  length(chunk_data.chunk),
  chunk_data.rank,
  'llm_generation',
  0.85
from events e,
(values
  (1, 'Large Language Models (LLMs) are AI systems trained on vast amounts of text data to understand and generate human-like language. They use transformer architectures to process sequences of text and can perform tasks like summarization, translation, and question answering.'),
  (2, 'Vector embeddings convert text into numerical representations in high-dimensional space (typically 1536 dimensions for OpenAI embeddings). These vectors capture semantic meaning, allowing similar concepts to be close together in vector space.'),
  (3, 'Semantic search uses vector similarity to find relevant content based on meaning rather than keyword matching. It enables finding documents that discuss similar topics even if they use different terminology.'),
  (4, 'Context generation is the process of building comprehensive knowledge bases that AI agents can reference during real-time interactions. This includes creating vector databases, glossaries, and structured information repositories.'),
  (5, 'Real-time event processing requires low-latency systems that can process incoming data streams and generate responses quickly. This is essential for live meeting assistance and interactive AI applications.')
) as chunk_data(rank, chunk)
where e.title = 'Demo Event - New Workflow';

-- Event 2: Legacy workflow (automatic context generation) for backward compatibility testing
insert into events (owner_uid, title, topic, start_time)
values
  ('00000000-0000-0000-0000-000000000000', 'Demo Event - Legacy Workflow', 'Legacy Automatic Context Generation', now() + interval '10 minutes');

-- Agent for Event 2 with legacy 'prepping' status
insert into agents (event_id, status)
select id, 'prepping' from events where title = 'Demo Event - Legacy Workflow';

-- Example transcript for Event 2
insert into transcripts (event_id, text)
select id, 'Welcome to our live demo on contextual agents!' from events where title = 'Demo Event - Legacy Workflow';