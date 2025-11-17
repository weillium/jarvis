-- Update match_context function to exclude items from superseded generation cycles
-- This ensures realtime sessions and processors only access active context items
create or replace function match_context(
  p_event uuid,
  p_query vector(1536),
  p_limit int default 5
) returns table(id uuid, chunk text, similarity float)
language sql stable as $$
  select ci.id, ci.chunk,
         1 - (ci.embedding <=> p_query) as similarity
  from context_items ci
  left join generation_cycles gc on ci.generation_cycle_id = gc.id
  where ci.event_id = p_event
    and (ci.generation_cycle_id is null or gc.status is null or gc.status != 'superseded')
  order by ci.embedding <-> p_query
  limit p_limit;
$$;

