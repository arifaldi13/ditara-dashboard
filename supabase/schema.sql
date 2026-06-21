create table if not exists public.cards (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards enable row level security;
alter table public.posts enable row level security;

drop policy if exists "Users can read their cards" on public.cards;
create policy "Users can read their cards"
on public.cards for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their cards" on public.cards;
create policy "Users can insert their cards"
on public.cards for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their cards" on public.cards;
create policy "Users can update their cards"
on public.cards for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their cards" on public.cards;
create policy "Users can delete their cards"
on public.cards for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their posts" on public.posts;
create policy "Users can read their posts"
on public.posts for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their posts" on public.posts;
create policy "Users can insert their posts"
on public.posts for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their posts" on public.posts;
create policy "Users can update their posts"
on public.posts for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their posts" on public.posts;
create policy "Users can delete their posts"
on public.posts for delete
to authenticated
using ((select auth.uid()) = user_id);
