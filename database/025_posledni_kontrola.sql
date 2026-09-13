-- Poslední úspěšná kontrola lobby zůstává u zápasu (uživatel 13. 9. 2026:
-- „sekce, kde se bude zobrazovat to poslední nastavení, které ta lobby měla,
-- než zmizí“). Jakmile lobby ze seznamu hry zmizí (hra běží), kontrola
-- ukáže tyhle řádky sbalené jako poslední známý stav.
ALTER TABLE zapas ADD COLUMN posledni_kontrola JSONB;
ALTER TABLE zapas ADD COLUMN posledni_kontrola_v TIMESTAMPTZ;
