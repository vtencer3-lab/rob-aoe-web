-- Režie může každému hráči v sestavě předepsat civilizaci (herní id, viz
-- src/shared/civilizace.ts). NULL = libovolná, hráč si vybere sám. Kontrola
-- lobby pak porovnává, co si hráč ve hře opravdu nastavil.
ALTER TABLE ucastnik ADD COLUMN civ SMALLINT;
