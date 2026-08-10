-- Portal za članove — Investicioni klub studenata FON-a
-- Pokrenuti u celosti kroz Supabase Dashboard -> SQL Editor -> New query,
-- na praznom projektu. Ako je stara šema (Next.js verzija) već pokrenuta na
-- ovom projektu, prvo obriši te tabele (Dashboard -> Database -> ili
-- Settings -> General -> Reset database) pre nego što pokreneš ovo.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type member_role as enum ('member', 'admin');
create type member_status as enum ('active', 'alumni');
create type tag_type as enum ('skill', 'interest');
create type project_status as enum ('planiranje', 'u_toku', 'zavrsen', 'pauziran');
create type task_status as enum ('todo', 'u_toku', 'zavrseno');
create type partner_status as enum (
  'nije_kontaktiran', 'kontaktiran', 'u_pregovorima', 'aktivna_saradnja', 'neuspesno'
);
create type transaction_type as enum ('prihod', 'rashod');
create type transaction_status as enum ('na_cekanju', 'odobreno', 'zavrseno', 'odbijeno');

-- ---------------------------------------------------------------------------
-- Sectors
-- ---------------------------------------------------------------------------

create table sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (members)
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null,
  phone text,
  linkedin_url text,
  sector_id uuid references sectors (id) on delete set null,
  position text,
  status member_status not null default 'active',
  role member_role not null default 'member',
  join_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tags (skills / interests) — shared, growing catalog + member assignments
-- ---------------------------------------------------------------------------

create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type tag_type not null,
  created_at timestamptz not null default now()
);

create unique index tags_name_type_unique_idx on tags (lower(name), type);

create table profile_tags (
  profile_id uuid not null references profiles (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (profile_id, tag_id)
);

-- ---------------------------------------------------------------------------
-- Projects + tasks
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date,
  deadline date,
  status project_status not null default 'planiranje',
  budget_amount numeric(12,2),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_members (
  project_id uuid not null references projects (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (project_id, profile_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references profiles (id) on delete set null,
  due_date date,
  status task_status not null default 'todo',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Partners — shared, spreadsheet-style, everyone can read & update
-- ---------------------------------------------------------------------------

create table partners (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_person text,
  email text,
  phone text,
  status partner_status not null default 'nije_kontaktiran',
  notes text,
  last_contact_date date,
  next_contact_date date,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table project_partners (
  project_id uuid not null references projects (id) on delete cascade,
  partner_id uuid not null references partners (id) on delete cascade,
  primary key (project_id, partner_id)
);

-- ---------------------------------------------------------------------------
-- Documents — admin-only at every layer (table RLS below, and the matching
-- storage.objects policy further down). Not part of the shared CRM like
-- partners: regular members should not see the list exists, let alone read
-- files, so this is never client-side-only gating.
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects (id) on delete cascade,
  name text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Finance — general ledger. Sponsor payment installments are just rows here
-- (income, linked to partner_id, due date in `date`, not yet 'zavrseno') so
-- the Kalendar page can plot them with the same logic as task/project dates.
-- ---------------------------------------------------------------------------

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

create table club_settings (
  id uuid primary key default gen_random_uuid(),
  annual_goal numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Beleške — one shared row (same single-row pattern as club_settings
-- above), everyone reads AND writes. No per-author entries, no locking,
-- no conflict warning — last save wins, on purpose, matching how
-- club_settings.annual_goal already behaves.
create table club_notes (
  id uuid primary key default gen_random_uuid(),
  content text not null default '',
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Rokovi van projekta — samostalni datumi na kalendaru (npr. dan
-- intervjua, zatvaranje prijava) koji nisu vezani ni za jedan projekat.
-- Početak i kraj (isti datum u oba polja za jednodnevni rok) — period
-- između se oboji na kalendaru, isto kao kod projekata.
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

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup (admin creates the auth user manually with
-- email+password in Supabase Dashboard; this fires right after that).
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on projects
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function public.set_updated_at();

create function public.set_updated_by()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger partners_set_updated_by
  before update on partners
  for each row execute function public.set_updated_by();

create trigger club_notes_set_updated_by
  before update on club_notes
  for each row execute function public.set_updated_by();

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create function public.current_role()
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin';
$$;

-- Owner ("Admin" in the UI) — one specific account, identified by email,
-- not a third member_role value. Their `role` column stays 'admin', so
-- every existing is_admin()/role==="admin" check (RLS policies, portal
-- page guards) keeps working for them unchanged. is_owner() is the one
-- extra gate, used only to guard the `role` column below.
create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select email = 'andrejvuckovic55@gmail.com' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Column protection: a member can update their own profile row, but only
-- the "personal" fields. sector_id/position/status/email stay admin-only,
-- and role is owner-only (even Uprava/admin cannot change roles, including
-- their own) — enforced here, not just hidden in the UI.
-- ---------------------------------------------------------------------------

create function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  -- auth.uid() is null when this runs outside a normal app request (e.g.
  -- Dashboard SQL Editor as postgres/service role) — that already has full
  -- DB access, so don't block it. Only restrict real member app sessions.
  if auth.uid() is null or public.is_owner() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Samo glavni admin može da menja uloge.';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.sector_id is distinct from old.sector_id
     or new.position is distinct from old.position
     or new.status is distinct from old.status
     or new.email is distinct from old.email
  then
    raise exception 'Samo admin može da menja sektor, poziciju, status ili email.';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on profiles
  for each row execute function public.protect_profile_fields();

-- Members may only update the `status` column on tasks assigned to them;
-- everything else (title, assignee, due date, project) is admin-only.
create function public.protect_task_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if old.assignee_id is distinct from auth.uid() then
    raise exception 'Samo dodeljeni član ili admin mogu da menjaju zadatak.';
  end if;

  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.project_id is distinct from old.project_id
     or new.assignee_id is distinct from old.assignee_id
     or new.due_date is distinct from old.due_date
  then
    raise exception 'Dodeljeni član može da menja samo status zadatka.';
  end if;

  return new;
end;
$$;

create trigger tasks_protect_fields
  before update on tasks
  for each row execute function public.protect_task_fields();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table sectors enable row level security;
alter table profiles enable row level security;
alter table tags enable row level security;
alter table profile_tags enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table project_partners enable row level security;
alter table tasks enable row level security;
alter table partners enable row level security;
alter table transactions enable row level security;
alter table club_settings enable row level security;
alter table documents enable row level security;
alter table club_notes enable row level security;
alter table calendar_events enable row level security;

-- sectors: everyone reads, only admin writes
create policy "sectors_select_all" on sectors
  for select using (auth.role() = 'authenticated');
create policy "sectors_admin_write" on sectors
  for all using (public.is_admin()) with check (public.is_admin());

-- profiles: everyone reads the directory; update self or admin (column
-- protection trigger above narrows what "self" can actually change);
-- only admin can change role/status directly on someone else or delete.
create policy "profiles_select_all" on profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_update_self_or_admin" on profiles
  for update using (id = auth.uid() or public.is_admin());

-- tags: everyone reads and can add a new tag to the shared catalog;
-- only admin edits/removes existing ones (cleanup).
create policy "tags_select_all" on tags
  for select using (auth.role() = 'authenticated');
create policy "tags_insert_all" on tags
  for insert with check (auth.role() = 'authenticated');
create policy "tags_admin_manage" on tags
  for update using (public.is_admin());
create policy "tags_admin_delete" on tags
  for delete using (public.is_admin());

-- profile_tags: everyone reads; a member manages only their own tags, admin
-- manages anyone's.
create policy "profile_tags_select_all" on profile_tags
  for select using (auth.role() = 'authenticated');
create policy "profile_tags_manage_own_or_admin" on profile_tags
  for all using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- projects + project_members: everyone reads, only admin writes
create policy "projects_select_all" on projects
  for select using (auth.role() = 'authenticated');
create policy "projects_admin_write" on projects
  for all using (public.is_admin()) with check (public.is_admin());

create policy "project_members_select_all" on project_members
  for select using (auth.role() = 'authenticated');
create policy "project_members_admin_write" on project_members
  for all using (public.is_admin()) with check (public.is_admin());

create policy "project_partners_select_all" on project_partners
  for select using (auth.role() = 'authenticated');
create policy "project_partners_admin_write" on project_partners
  for all using (public.is_admin()) with check (public.is_admin());

-- tasks: everyone reads; admin has full control; the assignee can update
-- (status only, enforced by trigger above) their own task.
create policy "tasks_select_all" on tasks
  for select using (auth.role() = 'authenticated');
create policy "tasks_admin_write" on tasks
  for insert with check (public.is_admin());
create policy "tasks_admin_delete" on tasks
  for delete using (public.is_admin());
create policy "tasks_update_assignee_or_admin" on tasks
  for update using (assignee_id = auth.uid() or public.is_admin());

-- partners: shared spreadsheet — every member reads, inserts and updates;
-- only admin deletes (guardrail against accidental data loss).
create policy "partners_select_all" on partners
  for select using (auth.role() = 'authenticated');
create policy "partners_insert_all" on partners
  for insert with check (auth.role() = 'authenticated');
create policy "partners_update_all" on partners
  for update using (auth.role() = 'authenticated');
create policy "partners_delete_admin" on partners
  for delete using (public.is_admin());

-- Live updates on the shared partners sheet.
alter publication supabase_realtime add table partners;

-- transactions: admin-only reads (money is more sensitive than the rest of
-- the CRM); anyone can propose one, but only for themselves and only as
-- 'na_cekanju' — non-admins can never insert a row they could already see
-- as approved/settled, and can't read the ledger back either way.
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

create policy "documents_admin_all" on documents
  for all using (auth.uid() is null or public.is_admin())
  with check (auth.uid() is null or public.is_admin());

-- club_notes: everyone reads and writes — same shared-spreadsheet trust
-- level as partners, not the admin-gated CRM tables above.
create policy "club_notes_select_all" on club_notes
  for select using (auth.role() = 'authenticated');
create policy "club_notes_update_all" on club_notes
  for update using (auth.role() = 'authenticated');

alter publication supabase_realtime add table club_notes;

-- calendar_events: everyone reads (so the deadline shows up on everyone's
-- calendar), only admin adds/edits/removes — same shape as projects.
create policy "calendar_events_select_all" on calendar_events
  for select using (auth.role() = 'authenticated');
create policy "calendar_events_admin_write" on calendar_events
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage — one private bucket for club documents. Files are only ever
-- served via createSignedUrl(), never a public link, and the bucket's own
-- storage.objects policy mirrors the admin-only rule on the documents table.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_storage_admin_all" on storage.objects
  for all using (bucket_id = 'documents' and (auth.uid() is null or public.is_admin()))
  with check (bucket_id = 'documents' and (auth.uid() is null or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Starting data — edit freely.
-- ---------------------------------------------------------------------------

insert into sectors (name, description) values
  ('IT i inovacije', 'Portal za članove, interni alati, tehnički projekti kluba.'),
  ('Marketing i PR', 'Društvene mreže, sadržaj, komunikacija sa javnošću.'),
  ('Sponzorstva i partnerstva', 'Odnosi sa bankama i institucijama.'),
  ('Korporativni i akademski odnosi', 'Saradnja sa fakultetom i profesorima, odnosi sa kompanijama van sponzorstva.'),
  ('Logistika i projekti', 'Organizacija radionica i događaja, koordinacija projekata kluba.'),
  ('Ljudski resursi', 'Regrutacija i onboarding novih članova, interna komunikacija i kultura kluba.')
on conflict (name) do nothing;

insert into tags (name, type) values
  ('Excel', 'skill'), ('PowerPoint', 'skill'), ('Python', 'skill'),
  ('Finansijska analiza', 'skill'), ('DCF i valuacija', 'skill'),
  ('Copywriting', 'skill'), ('Grafički dizajn', 'skill'), ('Javni nastup', 'skill'),
  ('Programiranje', 'skill'), ('Prodaja i pregovaranje', 'skill'),
  ('Investiciono bankarstvo', 'interest'), ('Asset management', 'interest'),
  ('Private equity', 'interest'), ('Marketing', 'interest'),
  ('Tržište kapitala', 'interest'), ('Startapi', 'interest')
on conflict (lower(name), type) do nothing;

insert into club_settings (annual_goal)
select 0
where not exists (select 1 from club_settings);

insert into club_notes (content)
select ''
where not exists (select 1 from club_notes);

-- ---------------------------------------------------------------------------
-- Bootstrap: run manually, ONCE, after creating each founder's auth user
-- (Dashboard -> Authentication -> Add user, with email + password, Auto
-- Confirm on). Replace the emails below.
-- ---------------------------------------------------------------------------

-- update public.profiles set role = 'admin'
-- where email in ('milos@example.com', 'mihailo@example.com');
