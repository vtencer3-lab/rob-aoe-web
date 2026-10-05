-- Pořadí verze scénáře (mód Diplomacie): kopie se sondou se hostovi
-- servíruje jako JIN_DIPLO_<poradi>.aoe2scenario a podle toho jména se
-- porovnává všechno — kontrola lobby, uložení do složky hry i most ke hře
-- (soubor .xsdat se jmenuje podle scénáře). Originál si nechává jméno, pod
-- kterým ho autor nahrál.
--
-- Od 2. 10. 2026 jdou verze mazat (dokud nejsou aktivní a nehraje je
-- žádný zápas), proto pořadí bere vlastní sekvence a smazané číslo se
-- nikdy nepoužije znovu: host se starou kopií JIN_DIPLO_3 nesmí projít
-- kontrolou lobby proti jiné verzi téhož jména. Dnešní verze dostanou
-- 1, 2, … podle id.
CREATE SEQUENCE diplo_scenar_poradi_seq;

ALTER TABLE diplo_scenar ADD COLUMN poradi INTEGER;

UPDATE diplo_scenar s
   SET poradi = r.n
  FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM diplo_scenar) r
 WHERE r.id = s.id;

SELECT setval('diplo_scenar_poradi_seq', COALESCE((SELECT max(poradi) FROM diplo_scenar), 0) + 1, false);

ALTER TABLE diplo_scenar
  ALTER COLUMN poradi SET DEFAULT nextval('diplo_scenar_poradi_seq'),
  ALTER COLUMN poradi SET NOT NULL,
  ADD CONSTRAINT diplo_scenar_poradi_key UNIQUE (poradi);

ALTER SEQUENCE diplo_scenar_poradi_seq OWNED BY diplo_scenar.poradi;
