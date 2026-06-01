-- Prullenbak met geheugen: zachte verwijdering van taken.
-- Voer dit één keer uit in de Supabase SQL Editor vóór je de nieuwe code deployt.
-- Zonder deze kolom faalt het laden van taken (kolom deleted_at bestaat niet).

alter table tasks add column if not exists deleted_at timestamptz;

-- Sneller filteren op actieve taken vs. prullenbak
create index if not exists idx_tasks_user_deleted on tasks (user_id, deleted_at);
