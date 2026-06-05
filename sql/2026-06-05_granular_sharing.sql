-- Granular sharing migration (2026-06-05)
-- Per-list sharing, per-person colors, per-event visibility.
-- Idempotent: safe to re-run.

-- 1. share_lists: which list(s) a share covers (carries label+color so the
--    invited person can render the list without reading the owner's lists table)
create table if not exists public.share_lists (
  id         uuid primary key default gen_random_uuid(),
  share_id   uuid not null references public.shares(id) on delete cascade,
  list_id    text not null,
  label      text,
  color      text,
  created_at timestamptz default now(),
  unique (share_id, list_id)
);
alter table public.share_lists enable row level security;

drop policy if exists "share_lists owner" on public.share_lists;
create policy "share_lists owner" on public.share_lists for all
  using      (exists (select 1 from public.shares s where s.id = share_lists.share_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.shares s where s.id = share_lists.share_id and s.owner_id = auth.uid()));

drop policy if exists "share_lists invited read" on public.share_lists;
create policy "share_lists invited read" on public.share_lists for select
  using (exists (select 1 from public.shares s
                 where s.id = share_lists.share_id
                   and s.invited_email = auth.email()
                   and s.status = 'accepted'));

-- 2. person_colors: viewer assigns a secondary colour to a person (local to viewer)
create table if not exists public.person_colors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  person_email text not null,
  color        text not null,           -- 'zwart' | 'oranje' | 'paars' | 'groen'
  created_at   timestamptz default now(),
  unique (user_id, person_email)
);
alter table public.person_colors enable row level security;
drop policy if exists "person_colors own" on public.person_colors;
create policy "person_colors own" on public.person_colors for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. events: per-event visibility
alter table public.events add column if not exists shared      boolean not null default false;
alter table public.events add column if not exists shared_with text[]  not null default '{}';

drop policy if exists "Read shared events" on public.events;
create policy "Read shared events" on public.events for select
  using (
    user_id = auth.uid()
    or (
      coalesce(shared, false) = true
      and auth.email() = any (shared_with)
      and exists (select 1 from public.shares s
                  where s.owner_id = events.user_id
                    and s.invited_email = auth.email()
                    and s.status = 'accepted')
    )
  );

-- 4. tasks: rescope shared access from "everything" to "only shared lists"
drop policy if exists "Read shared tasks" on public.tasks;
create policy "Read shared tasks" on public.tasks for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.shares s
               join public.share_lists sl on sl.share_id = s.id
               where s.owner_id = tasks.user_id
                 and s.invited_email = auth.email()
                 and s.status = 'accepted'
                 and sl.list_id = coalesce(tasks.list_id, 'mine'))
  );

drop policy if exists "Update shared tasks" on public.tasks;
create policy "Update shared tasks" on public.tasks for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.shares s
               join public.share_lists sl on sl.share_id = s.id
               where s.owner_id = tasks.user_id
                 and s.invited_email = auth.email()
                 and s.status = 'accepted'
                 and s.permission = 'edit'
                 and sl.list_id = coalesce(tasks.list_id, 'mine'))
  );

drop policy if exists "Delete shared tasks" on public.tasks;
create policy "Delete shared tasks" on public.tasks for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.shares s
               join public.share_lists sl on sl.share_id = s.id
               where s.owner_id = tasks.user_id
                 and s.invited_email = auth.email()
                 and s.status = 'accepted'
                 and s.permission = 'edit'
                 and sl.list_id = coalesce(tasks.list_id, 'mine'))
  );

drop policy if exists "Insert shared tasks" on public.tasks;
create policy "Insert shared tasks" on public.tasks for insert
  with check (
    user_id = auth.uid()
    or exists (select 1 from public.shares s
               join public.share_lists sl on sl.share_id = s.id
               where s.owner_id = tasks.user_id
                 and s.invited_email = auth.email()
                 and s.status = 'accepted'
                 and s.permission = 'edit'
                 and sl.list_id = coalesce(tasks.list_id, 'mine'))
  );

-- 5. lists: drop broad shared-read; invited reads list metadata from share_lists
drop policy if exists "Read shared lists" on public.lists;

-- 6. lists.id was uuid but the app uses text ids ('mine','list_123'); table is empty
--    so converting to text is safe and makes custom lists persist.
alter table public.lists alter column id type text;
