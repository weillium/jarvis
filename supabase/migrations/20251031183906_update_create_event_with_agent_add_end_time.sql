-- Update create_event_with_agent function to support end_time parameter
-- This migration extends the function to match the UI which collects both start_time and end_time

create or replace function create_event_with_agent(
  p_owner_uid uuid,
  p_title text,
  p_topic text default null,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
  v_agent_id uuid;
  v_event jsonb;
  v_agent jsonb;
begin
  -- Create event with end_time
  insert into events (owner_uid, title, topic, start_time, end_time)
  values (p_owner_uid, p_title, p_topic, p_start_time, p_end_time)
  returning id into v_event_id;

  -- Create agent linked to the event
  insert into agents (event_id, status)
  values (v_event_id, 'prepping')
  returning id into v_agent_id;

  -- Return both records as JSON
  select to_jsonb(e.*) into v_event
  from events e
  where e.id = v_event_id;

  select to_jsonb(a.*) into v_agent
  from agents a
  where a.id = v_agent_id;

  return jsonb_build_object(
    'event', v_event,
    'agent', v_agent
  );
end;
$$;

-- Update grant statements to match new signature
grant execute on function create_event_with_agent(uuid, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function create_event_with_agent(uuid, text, text, timestamptz, timestamptz) to service_role;

