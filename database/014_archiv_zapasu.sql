-- Archiv zápasů: aby šlo večer později přehrát, musí si zápas pamatovat i to,
-- co se kolem něj mění.
--
-- Nastavení lobby žije na akci a přepisuje se každým kliknutím, takže po
-- večeru zbyl jen jeho poslední stav a u zápasu už nešlo zjistit, na jaké mapě
-- a s jakými pravidly se hrál. Snímek se proto bere při založení zápasu.
--
-- ELO se u hráče přepisuje při každém stažení statistik. Bez otisku by archiv
-- ukazoval dnešní čísla u loňského zápasu.
ALTER TABLE zapas ADD COLUMN nastaveni JSONB;
ALTER TABLE ucastnik ADD COLUMN elo_pri_zapasu INTEGER;
