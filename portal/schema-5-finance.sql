-- Finansijski modul. Pokreni ovo jednom u SQL Editoru.
--
-- Model:
-- - `transactions` je opšta knjiga (prihodi i rashodi), sa statusom
--   na_cekanju -> odobreno -> zavrseno (ili odbijeno). I planirane uplate
--   sponzora (rate) su samo redovi u ovoj tabeli sa datumom dospeća i
--   statusom koji još nije "zavrseno" — nema posebne tabele za rate,
--   Kalendar ih već ume da iscrta preko iste logike kao rokove zadataka.
-- - Vidljivost (SELECT) je namerno SAMO admin — konkretni iznosi su
--   osetljiviji od ostatka CRM-a. Svako sme da UBACI (insert) predlog
--   transakcije, ali ako nije admin, mora da bude na svoje ime i sa
--   statusom "na_cekanju" (čeka odobrenje) — ne mogu da vide listu niti
--   da izmisle da je nešto već odobreno.
-- - `projects.budget_amount` ostaje u već-javnoj `projects` tabeli
--   (planiran budžet projekta) — manje osetljivo od konkretnih uplata
--   sponzora, ali UI ga svejedno prikazuje samo adminu radi doslednosti.

create type transaction_type as enum ('prihod', 'rashod');
create type transaction_status as enum ('na_cekanju', 'odobreno', 'zavrseno', 'odbijeno');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  type transaction_type not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  date date not null default current_date,
  status transaction_status not null default 'na_cekanju',
  project_id uuid references projects (id) on delete set null,
  partner_id uuid references partners (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function public.set_updated_at();

alter table projects add column if not exists budget_amount numeric(12,2);

create table club_settings (
  id uuid primary key default gen_random_uuid(),
  annual_goal numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into club_settings (annual_goal)
select 0
where not exists (select 1 from club_settings);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table transactions enable row level security;
alter table club_settings enable row level security;

create policy "transactions_select_admin" on transactions
  for select using (auth.uid() is null or public.is_admin());

create policy "transactions_insert_self_pending_or_admin" on transactions
  for insert with check (
    auth.uid() is null
    or public.is_admin()
    or (created_by = auth.uid() and status = 'na_cekanju')
  );

create policy "transactions_update_admin" on transactions
  for update using (auth.uid() is null or public.is_admin());

create policy "transactions_delete_admin" on transactions
  for delete using (auth.uid() is null or public.is_admin());

create policy "club_settings_select_admin" on club_settings
  for select using (auth.uid() is null or public.is_admin());

create policy "club_settings_update_admin" on club_settings
  for update using (auth.uid() is null or public.is_admin());
