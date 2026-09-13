-- Chat v lobby: hráči zápasu a admini si píšou u karty zápasu. Zprávy patří
-- k zápasu a zůstávají v databázi i po večeru (archiv), se zápasem mizí.
-- Jméno, barva a tým se nekopírují — čtou se při sestavení stavu z player
-- a ucastnik, ať zpráva ukazuje aktuální přezdívku a barvu.
CREATE TABLE zprava (
  id        SERIAL PRIMARY KEY,
  zapas_id  INTEGER NOT NULL REFERENCES zapas(id) ON DELETE CASCADE,
  steam_id  TEXT NOT NULL REFERENCES player(steam_id),
  text      TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  poslano   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX zprava_zapas_idx ON zprava (zapas_id, id);
