-- API keys: one key per user, used by /api/data for read + write access.
-- The endpoint validates the key with the service role (bypasses RLS);
-- the app manages its own key under the user session (RLS below).
create table if not exists public.api_keys (
  user_id    uuid primary key,
  key        text not null unique,
  created_at timestamptz default now()
);
alter table public.api_keys enable row level security;
drop policy if exists "api_keys own" on public.api_keys;
create policy "api_keys own" on public.api_keys for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
