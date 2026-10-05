-- Osobní klíč mostu ke hře (uživatel 5. 10. 2026): kdo chce posílat data
-- z běžící hry ze svého Streamer.botu, vygeneruje si na webu klíč. Web drží
-- jen jeho otisk (SHA-256), klíč samotný se ukáže jednou. Data se přijmou
-- jen od GM běžícího zápasu Diplomacie (src/diplomacie/mostKlic.ts).
CREATE TABLE diplo_most_klic (
  hrac_id      TEXT PRIMARY KEY REFERENCES player(hrac_id) ON DELETE CASCADE,
  otisk        TEXT NOT NULL UNIQUE,
  vytvoren_v   TIMESTAMPTZ NOT NULL DEFAULT now(),
  naposledy_v  TIMESTAMPTZ
);
