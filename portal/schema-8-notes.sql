-- Beleške — jedan deljeni "izveštaj" koji svako (član, uprava, admin) sme
-- i da čita i da menja. Pokreni ovo jednom u SQL Editoru.
--
-- Model: jedan red (isti obrazac kao club_settings) — nema pojedinačnih
-- beleški po autoru, samo jedan tekst koji svi zajedno grade. Ko poslednji
-- sačuva, pobeđuje (last write wins) — nema zaključavanja niti upozorenja
-- o sukobu izmena, isto kao ni annual_goal.

create table club_notes (
  id uuid primary key default gen_random_uuid(),
  content text not null default '',
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger club_notes_set_updated_by
  before update on club_notes
  for each row execute function public.set_updated_by();

alter table club_notes enable row level security;

create policy "club_notes_select_all" on club_notes
  for select using (auth.role() = 'authenticated');

create policy "club_notes_update_all" on club_notes
  for update using (auth.role() = 'authenticated');

-- Live sync — ako neko drugi sačuva dok gledaš stranicu, prikaz se sam osveži.
alter publication supabase_realtime add table club_notes;

insert into club_notes (content)
select ''
where not exists (select 1 from club_notes);
