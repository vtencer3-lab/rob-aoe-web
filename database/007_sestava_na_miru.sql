-- Rob si sestavu skládá sám: každému hráči naklikne tým (– nebo 1 až 4) a
-- barvu (8 jako ve hře) a pořadí, v jakém je naklikal, je pořadí slotů v
-- lobby. Tím padá pevný „formát“ (1v1 / Coop Kings 2v2), ze kterého se
-- rozsazení dřív odvozovalo — formát je od teď jen slovo pro to, co v sestavě
-- je, a spočítá se z ní.
--
-- Vítěz už není „tým 1 nebo 2“: hráč bez týmu hraje sám za sebe a může
-- vyhrát on. Sloupec vitez je text „tym:2“ nebo „hrac:<steam_id>“; stará
-- hodnota vitezny_tym se převede. Jedna transakce (scripts/migrate.ts), takže
-- buď projde všechno, nebo nic.

ALTER TABLE ucastnik ADD COLUMN poradi SMALLINT NOT NULL DEFAULT 0;
UPDATE ucastnik u
   SET poradi = s.rn
  FROM (SELECT zapas_id, steam_id,
               row_number() OVER (PARTITION BY zapas_id ORDER BY tym, steam_id) - 1 AS rn
          FROM ucastnik) s
 WHERE s.zapas_id = u.zapas_id AND s.steam_id = u.steam_id;
ALTER TABLE ucastnik ALTER COLUMN poradi DROP DEFAULT;

ALTER TABLE zapas ADD COLUMN vitez TEXT;
UPDATE zapas SET vitez = 'tym:' || vitezny_tym WHERE vitezny_tym IS NOT NULL;
ALTER TABLE zapas DROP COLUMN vitezny_tym;
ALTER TABLE zapas DROP COLUMN format;
