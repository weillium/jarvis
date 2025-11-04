-- Fast KNN search over context_items for an event
create or replace function match_context(
  p_event uuid,
  p_query vector(1536),
  p_limit int default 5
) returns table(id uuid, chunk text, similarity float)
language sql stable as $$
  select ci.id, ci.chunk,
         1 - (ci.embedding <=> p_query) as similarity
  from context_items ci
  where ci.event_id = p_event
  order by ci.embedding <-> p_query
  limit p_limit;
$$;

-- Helpful index for pgvector
create index if not exists idx_context_items_event_embedding
  on context_items using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);