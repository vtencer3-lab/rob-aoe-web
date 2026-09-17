-- Klíč hráče přestává být Steam ID: hráč z Microsoft Store žádné nemá a bez
-- neutrálního klíče by se do databáze nedal zapsat vůbec. Hodnoty stávajících
-- řádků se nemění, takže se nesahá na data ani na cizí klíče — mění se jen
-- jméno sloupce. Zkušební hráči (`test:pepa`) tam ostatně nejsou od začátku.
ALTER TABLE player    RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE session   RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE prihlaska RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE prihlaska RENAME COLUMN svolal_steam_id TO svolal_hrac_id;
ALTER TABLE ucastnik  RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE zprava    RENAME COLUMN steam_id TO hrac_id;

-- Platforma a identifikátory na ní. `steam_id` se vrací jako obyčejný sloupec:
-- u Steam hráčů má stejnou hodnotu jako klíč, u Microsoft hráčů je prázdný.
ALTER TABLE player ADD COLUMN platforma TEXT NOT NULL DEFAULT 'steam'
  CHECK (platforma IN ('steam', 'xbox'));
ALTER TABLE player ADD COLUMN steam_id      TEXT UNIQUE;
ALTER TABLE player ADD COLUMN xbox_xuid     TEXT UNIQUE;
ALTER TABLE player ADD COLUMN xbox_gamertag TEXT;

-- Profil ve Worlds Edge. `we_profil_id` je číslo, které backend hry používá
-- pro obě platformy — na něm stojí rozpoznání hráčů v seznamu lobby.
ALTER TABLE player ADD COLUMN we_profil    TEXT;
ALTER TABLE player ADD COLUMN we_profil_id INTEGER UNIQUE;

-- Dosavadní hráči jsou všichni ze Steamu; zkušební `test:` nechat bez steam_id.
UPDATE player SET steam_id = hrac_id WHERE hrac_id ~ '^\d{17}$';
