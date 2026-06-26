-- Create wardrobe-photos bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wardrobe-photos',
  'wardrobe-photos',
  false,
  5242880, -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Storage RLS: users can only access files in their own folder (user_id/*)
create policy "users can upload own photos"
  on storage.objects for insert
  with check (
    bucket_id = 'wardrobe-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users can view own photos"
  on storage.objects for select
  using (
    bucket_id = 'wardrobe-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users can delete own photos"
  on storage.objects for delete
  using (
    bucket_id = 'wardrobe-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
