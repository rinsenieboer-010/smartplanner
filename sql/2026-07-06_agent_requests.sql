-- Terminal-bridge wachtrij. De telefoon-app schrijft hier een bericht voor een
-- van de echte terminal-agents (Bart, Piet, ...). Een lokaal bridge-proces op
-- Rinse's laptop (draait met de service role) pikt 'pending' rijen op, voert de
-- echte agent via de Claude Code CLI uit en schrijft het antwoord terug.
--
-- App: leest/schrijft eigen rijen via de user-sessie (RLS).
-- Bridge: gebruikt de service role key (RLS wordt omzeild) en filtert op user_id.
create table if not exists public.agent_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  agent_key   text not null,                     -- mapt op agents/<key>/ (bijv. 'bart')
  agent_name  text,                              -- weergavenaam (bijv. 'Bart')
  message     text not null,
  status      text not null default 'pending',   -- pending | running | done | error
  reply       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.agent_requests enable row level security;
drop policy if exists "agent_requests own" on public.agent_requests;
create policy "agent_requests own" on public.agent_requests for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Snel de oudste openstaande verzoeken vinden voor de bridge-poll.
create index if not exists agent_requests_pending_idx
  on public.agent_requests (user_id, status, created_at);
