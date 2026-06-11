-- Herhalende taken: herhaalpatroon + laatste afvinkmoment
alter table tasks add column if not exists recurrence text;          -- 'daily' | 'weekly' | 'biweekly' | 'monthly' | null
alter table tasks add column if not exists last_completed_at timestamptz;
