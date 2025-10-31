insert into events (owner_uid, title, topic, start_time)
values
  ('00000000-0000-0000-0000-000000000000', 'Demo Event', 'AI Context Agents', now() + interval '5 minutes');

insert into agents (event_id, status)
select id, 'prepping' from events limit 1;

insert into transcripts (event_id, text)
select id, 'Welcome to our live demo on contextual agents!' from events limit 1;

-- Seed a demo user into auth.users (works locally)
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