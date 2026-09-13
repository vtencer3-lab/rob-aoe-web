-- Lhůta aktivity je globální nastavení webu, ne věc akce (uživatel 13. 9.
-- 2026: „dá se říct, že je to globální nastavení“ — má být vidět i mimo akci
-- a platit přes akce). Jediný řádek; hodnota se převezme z poslední akce,
-- ať se nastavené číslo releasem neztratí.
CREATE TABLE nastaveni_webu (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lhuta_aktivity_minut INTEGER NOT NULL DEFAULT 15 CHECK (lhuta_aktivity_minut BETWEEN 2 AND 120)
);
INSERT INTO nastaveni_webu (id, lhuta_aktivity_minut)
  VALUES (1, COALESCE((SELECT lhuta_aktivity_minut FROM akce ORDER BY id DESC LIMIT 1), 15));
ALTER TABLE akce DROP COLUMN lhuta_aktivity_minut;
