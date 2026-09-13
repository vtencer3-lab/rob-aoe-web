-- Vlastnictví hry podle Steamu vedle jména hráče: ikona hry, otazník u skryté
-- knihovny, vykřičník když hra v knihovně chybí. GetOwnedGames to říká tvarem
-- odpovědi (skrytá knihovna nemá game_count), takže se to pamatuje zvlášť od
-- hodin, kde null znamená obojí.
ALTER TABLE player ADD COLUMN steam_hra TEXT
  CHECK (steam_hra IN ('ma', 'nema', 'soukromy'));
