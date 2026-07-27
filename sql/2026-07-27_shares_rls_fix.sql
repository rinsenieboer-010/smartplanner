-- Shares RLS fix (2026-07-27)
-- Probleem: een uitgenodigde persoon kon zijn eigen uitnodiging niet ZIEN of
-- ACCEPTEREN, omdat er (waarschijnlijk) alleen een owner-policy op public.shares
-- stond. Hierdoor gaf de app wel "wacht op acceptatie" bij de afzender, maar aan
-- de ontvangerskant verscheen de uitnodiging niet / kon je 'm niet accepteren.
--
-- Deze migratie is idempotent (veilig om opnieuw te draaien).

alter table public.shares enable row level security;

-- 1. Eigenaar mag alles met zijn eigen shares (uitnodigen, rechten wijzigen, stoppen)
drop policy if exists "shares owner all" on public.shares;
create policy "shares owner all" on public.shares for all
  using      (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 2. Uitgenodigde mag uitnodigingen LEZEN die aan zijn e-mailadres gericht zijn
--    (zo verschijnt de binnenkomende uitnodiging in de app)
drop policy if exists "shares invited read" on public.shares;
create policy "shares invited read" on public.shares for select
  using (invited_email = auth.email());

-- 3. Uitgenodigde mag de status van ZIJN eigen uitnodiging bijwerken
--    (accepteren / weigeren)
drop policy if exists "shares invited respond" on public.shares;
create policy "shares invited respond" on public.shares for update
  using      (invited_email = auth.email())
  with check (invited_email = auth.email());
