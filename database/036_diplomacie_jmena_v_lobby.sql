-- Jméno pro hru (migrace 035) do nastavení lobby neskončených akcí
-- Diplomacie. Kontrola lobby porovnává `scenar` a `scenarStarsi` se jménem,
-- pod kterým hra scénář hlásí — od 1.13.10-29.0 je to
-- JIN_DIPLO_<pořadí>.aoe2scenario. Akce otevřená před nasazením měla
-- v nastavení ještě jména originálů a hostovi se staženou kopií by kontrola
-- hlásila jiný soubor. Dál nastavení přepisuje aktivace a smazání verze.
WITH jmena AS (
  SELECT
    (SELECT 'JIN_DIPLO_' || poradi || '.aoe2scenario' FROM diplo_scenar WHERE aktivni) AS scenar,
    COALESCE((SELECT jsonb_agg('JIN_DIPLO_' || poradi || '.aoe2scenario' ORDER BY poradi DESC) FROM diplo_scenar WHERE NOT aktivni), '[]'::jsonb) AS starsi
)
UPDATE akce a
   SET nastaveni_lobby = a.nastaveni_lobby || jsonb_build_object('scenar', j.scenar, 'scenarStarsi', j.starsi),
       ulozene_nastaveni_lobby = CASE
         WHEN a.ulozene_nastaveni_lobby ? 'scenar'
           THEN a.ulozene_nastaveni_lobby || jsonb_build_object('scenar', j.scenar, 'scenarStarsi', j.starsi)
         ELSE a.ulozene_nastaveni_lobby
       END
  FROM jmena j
 WHERE a.rezim = 'diplomacie' AND a.stav <> 'konec' AND j.scenar IS NOT NULL;
