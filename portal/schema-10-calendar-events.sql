-- Dodaje samostalne rokove na kalendaru — datume koji nisu vezani ni za
-- jedan projekat (npr. dan intervjua, zatvaranje prijava, period prijava).
-- Rok ima početak i kraj (za jednodnevni rok se unese isti datum u oba
-- polja) — period između se oboji na kalendaru, isto kao kod projekata.
-- Pokreni jednom u SQL Editoru. Ista RLS šema kao projects: svi članovi
-- čitaju (da bi im se rok pojavio na kalendaru), samo admin/uprava
-- dodaje/menja/briše.
--
-- Ako si već pokrenuo/la raniju verziju ovog fajla (sa jednom kolonom
-- `date` umesto `start_date`/`end_date`) — obriši staru tabelu prvo, još
-- nema pravih podataka u njoj pa nema šta da se izgubi:
--   drop table if exists calendar_events;

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (end_date >= start_date)
);

alter table calendar_events enable row level security;

create policy "calendar_events_select_all" on calendar_events
  for select using (auth.role() = 'authenticated');
create policy "calendar_events_admin_write" on calendar_events
  for all using (public.is_admin()) with check (public.is_admin());
