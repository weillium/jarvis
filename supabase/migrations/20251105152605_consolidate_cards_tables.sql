-- ============================================================================
-- Phase 2: Consolidate Cards Tables
-- Merge cards into agent_outputs, keep cards as view for backward compatibility
-- ============================================================================

-- Step 1: Migrate existing cards to agent_outputs (if not already there)
-- Find cards that don't have corresponding agent_outputs
insert into agent_outputs (event_id, agent_id, agent_type, type, payload, created_at)
select 
  c.event_id,
  a.id as agent_id,
  'cards' as agent_type,
  'card' as type,
  c.payload,
  c.emitted_at as created_at
from cards c
left join agents a on a.event_id = c.event_id
left join agent_outputs ao on 
  ao.event_id = c.event_id and 
  ao.agent_type = 'cards' and 
  ao.type = 'card' and
  ao.payload->>'source_seq' = c.payload->>'source_seq' and
  ao.created_at = c.emitted_at
where ao.id is null
  and a.id is not null;

-- Step 2: Create view for backward compatibility
create or replace view cards_view as
select 
  ao.id::text as id,
  ao.event_id,
  ao.payload->>'kind' as kind,
  ao.created_at as emitted_at,
  ao.payload
from agent_outputs ao
where ao.agent_type = 'cards' 
  and ao.type = 'card';

-- Step 3: Create trigger to insert into agent_outputs when cards are inserted (backward compatibility)
create or replace function sync_cards_to_agent_outputs()
returns trigger as $$
declare
  v_agent_id uuid;
begin
  -- Find agent for this event
  select id into v_agent_id
  from agents
  where event_id = new.event_id
  limit 1;

  if v_agent_id is null then
    raise exception 'No agent found for event %', new.event_id;
  end if;

  -- Insert into agent_outputs
  insert into agent_outputs (event_id, agent_id, agent_type, type, payload, created_at)
  values (new.event_id, v_agent_id, 'cards', 'card', new.payload, new.emitted_at)
  on conflict do nothing;

  return new;
end;
$$ language plpgsql;

-- Step 4: Create trigger on cards table (if we keep it)
drop trigger if exists sync_cards_trigger on cards;
create trigger sync_cards_trigger
  after insert on cards
  for each row
  execute function sync_cards_to_agent_outputs();

-- Step 5: Add indexes to agent_outputs for better query performance
create index if not exists idx_agent_outputs_event_type_created 
  on agent_outputs(event_id, agent_type, created_at desc)
  where agent_type = 'cards' and type = 'card';

-- Step 6: Update comments
comment on view cards_view is 'Backward compatibility view for cards table. Use agent_outputs directly instead.';
comment on table agent_outputs is 'Unified table for all agent outputs (cards and facts). Use this instead of cards table.';

