-- Per-list permissions for granular sharing.
-- Existing rows inherit the permission from their parent share.

alter table public.share_lists
  add column if not exists permission text;

update public.share_lists sl
set permission = coalesce(s.permission, 'view')
from public.shares s
where s.id = sl.share_id
  and sl.permission is null;

alter table public.share_lists
  alter column permission set default 'view';

alter table public.share_lists
  alter column permission set not null;

alter table public.share_lists
  drop constraint if exists share_lists_permission_check;

alter table public.share_lists
  add constraint share_lists_permission_check
  check (permission in ('view', 'edit'));

drop policy if exists "Update shared tasks" on public.tasks;
create policy "Update shared tasks" on public.tasks for update
  using (
    user_id = auth.uid()
    or exists (select 1 from public.shares s
               join public.share_lists sl on sl.share_id = s.id
               where s.owner_id = tasks.user_id
                 and s.invited_email = auth.email()
                 and s.status = 'accepted'
                 and sl.permission = 'edit'
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
                 and sl.permission = 'edit'
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
                 and sl.permission = 'edit'
                 and sl.list_id = coalesce(tasks.list_id, 'mine'))
  );
