-- CRM proširenje partnera + Dokumenti modul. Pokreni ovo jednom u SQL Editoru
-- (schema.sql je već pokrenut ranije).
--
-- Model:
-- - `partners` dobija poslednji/sledeći kontakt datum — isti "ko sme da
--   piše" krug kao i ostala polja (partners_update_all, svaki član).
-- - `documents` je nova tabela + privatni Storage bucket. Namerno
--   ADMIN-ONLY na oba nivoa (tabela i storage.objects) — dokumenti nisu
--   deo deljenog CRM-a kao partneri, korisnik je eksplicitno tražio da
--   obični članovi ne vide ni listu ni fajlove, ne samo da dugme bude
--   sakriveno u UI-ju.

-- ---------------------------------------------------------------------------
-- Partners: kontakt istorija
-- ---------------------------------------------------------------------------

alter table partners add column if not exists last_contact_date date;
alter table partners add column if not exists next_contact_date date;

-- ---------------------------------------------------------------------------
-- Documents
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

alter table documents enable row level security;

create policy "documents_admin_all" on documents
  for all using (auth.uid() is null or public.is_admin())
  with check (auth.uid() is null or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage — privatni bucket, fajlovi se serviraju samo preko potpisanih
-- URL-ova (createSignedUrl), nikad kao javni link.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_storage_admin_all" on storage.objects
  for all using (bucket_id = 'documents' and (auth.uid() is null or public.is_admin()))
  with check (bucket_id = 'documents' and (auth.uid() is null or public.is_admin()));
