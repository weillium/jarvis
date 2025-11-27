-- Ensure the storage bucket used for card visuals exists.
-- Card images are served publicly so the marketing/web apps can render them without signed URLs.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'card-assets',
    'card-assets',
    true,
    52428800, -- 50 MB upper bound per object
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  )
  on conflict (id) do nothing;
exception
  when others then
    null; -- ignore errors if bucket already exists or caller lacks perms
end $$;


