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

-- ---------------------------------------------------------------------------
-- Column protection: a member can update their own profile row, but only
-- the "personal" fields. sector_id/position/status/role/email stay
-- admin-only, enforced here (not just hidden in the UI).
-- ---------------------------------------------------------------------------

create function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  -- auth.uid() is null when this runs outside a normal app request (e.g.
  -- Dashboard SQL Editor as postgres/service role) — that already has full
  -- DB access, so don't block it. Only restrict real member app sessions.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.sector_id is distinct from old.sector_id
     or new.position is distinct from old.position
     or new.status is distinct from old.status
     or new.role is distinct from old.role
     or new.email is distinct from old.email
  then
    raise exception 'Samo admin može da menja sektor, poziciju, status, ulogu ili email.';
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

-- ---------------------------------------------------------------------------
-- Starting data — edit freely.
-- ---------------------------------------------------------------------------

insert into sectors (name, description) values
  ('IT i inovacije', 'Portal za članove, interni alati, tehnički projekti kluba.'),
  ('Marketing i PR', 'Društvene mreže, sadržaj, komunikacija sa javnošću.'),
  ('Sponzorstva i partnerstva', 'Odnosi sa bankama i institucijama.'),
  ('Edukacija i sadržaj', 'Radionice, mesečne analize, gostujuća predavanja.')
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

-- ---------------------------------------------------------------------------
-- Bootstrap: run manually, ONCE, after creating each founder's auth user
-- (Dashboard -> Authentication -> Add user, with email + password, Auto
-- Confirm on). Replace the emails below.
-- ---------------------------------------------------------------------------

-- update public.profiles set role = 'admin'
-- where email in ('milos@example.com', 'mihailo@example.com');
