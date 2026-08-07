-- Pokreni OVO PRVO ako je prethodni (neuspešni) pokušaj ostavio delimično
-- kreirane tabele/tipove (npr. greška "type already exists" ili "relation
-- already exists"). Briše sve što schema.sql pravi, da se onda schema.sql
-- može pokrenuti iz čista.

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists partners cascade;
drop table if exists tasks cascade;
drop table if exists project_members cascade;
drop table if exists projects cascade;
drop table if exists profile_tags cascade;
drop table if exists tags cascade;
drop table if exists profiles cascade;
drop table if exists sectors cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.set_updated_by() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.protect_profile_fields() cascade;
drop function if exists public.protect_task_fields() cascade;

drop type if exists member_role cascade;
drop type if exists member_status cascade;
drop type if exists tag_type cascade;
drop type if exists project_status cascade;
drop type if exists task_status cascade;
drop type if exists partner_status cascade;
