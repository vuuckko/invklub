-- Popravka: trigeri su blokirali čak i SQL Editor (postgres rolu) jer
-- auth.uid() tamo vraća prazno van prave app sesije. Ovo ih menja da tu
-- situaciju tretiraju kao pun pristup (SQL Editor već ima pun pristup bazi
-- preko dashboard-a), a i dalje ograničavaju obične članove iz aplikacije.

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
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

create or replace function public.protect_task_fields()
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

-- Sad kad je popravljeno, odmah postavi sebe za admina:
update public.profiles set role = 'admin' where email = 'andrejvuckovic55@gmail.com';
