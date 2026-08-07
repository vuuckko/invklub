-- Dodaje datum početka projekta (deadline već postoji i sad se tretira kao
-- datum završetka), da bi se moglo izračunati trajanje.

alter table projects add column if not exists start_date date;
