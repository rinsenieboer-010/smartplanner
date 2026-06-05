-- Lists were keyed by a single global id, so default ids ('mine','school',…)
-- could only exist once across ALL users — breaking per-user persistence and
-- renaming. Make the primary key composite (user_id, id). Table is empty so
-- this is safe.
alter table public.lists drop constraint if exists lists_pkey;
alter table public.lists add primary key (user_id, id);
