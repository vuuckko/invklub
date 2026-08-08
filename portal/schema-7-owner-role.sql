-- Vlasnički nalog ("Admin") — jedan konkretan nalog (prepoznat po emailu, ne
-- nova vrednost u member_role enumu) koji sme sve što i Uprava, plus jednu
-- stvar koju Uprava od sada NE sme: da menja uloge (svoju ili tuđu).
-- Pokreni ovo jednom u SQL Editoru (schema.sql je već pokrenut ranije).
--
-- Namerno NIJE treći red u member_role enumu — vlasnikov `role` u bazi
-- ostaje 'admin', tako da svaka postojeća provera is_admin()/role==="admin"
-- (RLS politike, client-side čuvari stranica u portalu) i dalje radi za
-- njega bez ijedne izmene. is_owner() je jedina nova kapija, i koristi se
-- samo za polje `role`.

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

-- Menjanje uloge je sad dozvoljeno samo vlasniku — čak i postojećoj Upravi
-- je to sad zabranjeno. Ostala admin-only polja (sektor/pozicija/status/
-- email) ostaju nepromenjena, i dalje ih menja svaki admin.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
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
