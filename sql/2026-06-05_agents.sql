-- Per-user agents. Each user defines their own agents (name + system prompt
-- + model). The /api/agent-run endpoint reads these with the service role.
create table if not exists public.agents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  name          text not null,
  role          text,
  emoji         text,
  model         text not null default 'sonnet',   -- 'opus' | 'sonnet' | 'haiku'
  system_prompt text,
  created_at    timestamptz default now()
);
alter table public.agents enable row level security;
drop policy if exists "agents own" on public.agents;
create policy "agents own" on public.agents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
