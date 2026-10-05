-- XS sonda Diplomacie (most ke hře): web ji přibaluje do kopie scénáře,
-- kterou host stahuje; originál od autora zůstává v `data` (záloha a
-- stažení přes ?original=1). `sonda` nese výpis sekundárních cílů z triggerů
-- ({promenna, slot, text, limit}), počet označených triggerů přidělení a
-- případnou chybu přibalení. Obojí NULL = verze nahraná dřív; sondu jí
-- dopočítá POST /api/diplo/scenar/:id/sonda.
ALTER TABLE diplo_scenar
  ADD COLUMN data_sonda BYTEA,
  ADD COLUMN sonda      JSONB;
