-- Agenda delen per connectie (2026-07-28)
-- Voegt een vlag toe zodat je in één keer je hele agenda met een connectie deelt,
-- naast het bestaande per-afspraak delen. Idempotent (veilig om opnieuw te draaien).

alter table public.shares add column if not exists share_calendar boolean not null default false;

-- Afspraken lezen: eigen afspraken, OF per-afspraak gedeeld met mij, OF de eigenaar
-- deelt zijn hele agenda met mij (share_calendar = true).
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
    or exists (select 1 from public.shares s
               where s.owner_id = events.user_id
                 and s.invited_email = auth.email()
                 and s.status = 'accepted'
                 and s.share_calendar = true)
  );
