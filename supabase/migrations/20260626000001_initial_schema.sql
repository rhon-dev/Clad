-- clothing_items table
create table if not exists public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  category text not null default '',
  color text not null default '',
  style_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- RLS
alter table public.clothing_items enable row level security;

create policy "users can select own items"
  on public.clothing_items for select
  using (auth.uid() = user_id);

create policy "users can insert own items"
  on public.clothing_items for insert
  with check (auth.uid() = user_id);

create policy "users can update own items"
  on public.clothing_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete own items"
  on public.clothing_items for delete
  using (auth.uid() = user_id);

-- rate limit table for recommend-outfit edge function
create table if not exists public.recommendation_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  called_at timestamptz not null default now()
);

alter table public.recommendation_calls enable row level security;

create policy "users can insert own calls"
  on public.recommendation_calls for insert
  with check (auth.uid() = user_id);

create policy "users can select own calls"
  on public.recommendation_calls for select
  using (auth.uid() = user_id);

-- index for fast rate limit queries
create index if not exists recommendation_calls_user_time_idx
  on public.recommendation_calls(user_id, called_at desc);
