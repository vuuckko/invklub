-- Ažurira listu sektora. Pokreni jednom u SQL Editoru.
-- - Dodaje "Logistika i projekti" i "Ljudski resursi".
-- - Preimenuje "Edukacija i sadržaj" u "Korporativni i akademski odnosi"
--   (UPDATE, ne delete+insert — čuva sector_id kod članova koji ga već
--   imaju dodeljenog; brisanje reda bi im ga tiho obrisalo preko
--   `sector_id references sectors(id) on delete set null`).

insert into sectors (name, description) values
  ('Logistika i projekti', 'Organizacija radionica i događaja, koordinacija projekata kluba.'),
  ('Ljudski resursi', 'Regrutacija i onboarding novih članova, interna komunikacija i kultura kluba.')
on conflict (name) do nothing;

update sectors
set name = 'Korporativni i akademski odnosi',
    description = 'Saradnja sa fakultetom i profesorima, odnosi sa kompanijama van sponzorstva.'
where name = 'Edukacija i sadržaj';
