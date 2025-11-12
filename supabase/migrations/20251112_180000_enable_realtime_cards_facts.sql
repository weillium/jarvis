-- Ensure cards, facts, and agent session tables broadcast through Supabase Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cards;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'facts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.facts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_outputs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_outputs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_sessions;
  END IF;
END;
$$;
