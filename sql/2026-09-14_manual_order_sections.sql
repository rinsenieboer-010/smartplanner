-- Handmatige volgorde + secties in takenlijsten (2026-09-14)
--
-- tasks.sort_order  : handmatige plek binnen een lijst. NULL = automatisch
--                     sorteren (datum, dan prioriteit). Zodra je in een lijst
--                     sleept, krijgt alles in die lijst een sort_order.
-- lists.sort_order  : volgorde van de lijsten in de zijbalk.
-- lists.sections    : secties (gekleurde tussenkopjes) binnen een lijst,
--                     als [{ "id", "title", "color", "sortOrder" }]. sortOrder
--                     deelt dezelfde schaal als tasks.sort_order.
--
-- Alleen kolommen erbij, niets verwijderd. Bestaande RLS-policies dekken dit.

alter table public.tasks add column if not exists sort_order double precision;
alter table public.lists add column if not exists sort_order integer;
alter table public.lists add column if not exists sections jsonb not null default '[]'::jsonb;
