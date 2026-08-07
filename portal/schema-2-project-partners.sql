-- Dodatak na schema.sql — pokreni OVO u SQL Editoru (schema.sql je već
-- pokrenut, ovo samo dodaje vezu projekat <-> partner).

create table project_partners (
  project_id uuid not null references projects (id) on delete cascade,
  partner_id uuid not null references partners (id) on delete cascade,
  primary key (project_id, partner_id)
);

alter table project_partners enable row level security;

create policy "project_partners_select_all" on project_partners
  for select using (auth.role() = 'authenticated');
create policy "project_partners_admin_write" on project_partners
  for all using (public.is_admin()) with check (public.is_admin());
