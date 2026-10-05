-- Jména pro hru mají od 1.13.10-29.8 společný prefix ROB_ (ROB_DIPLO_<pořadí>
-- místo JIN_DIPLO_<pořadí>): agent na herním PC hlídá jen ROB_*.xsdat.
-- Nastavení lobby neskončených akcí Diplomacie se přepíše stejně jako
-- v migraci 036, jinak by kontrola lobby hostovi se staženou kopií hlásila
-- jiný soubor.
WITH jmena AS (
  SELECT
    (SELECT 'ROB_DIPLO_' || poradi || '.aoe2scenario' FROM diplo_scenar WHERE aktivni) AS scenar,
    COALESCE((SELECT jsonb_agg('ROB_DIPLO_' || poradi || '.aoe2scenario' ORDER BY poradi DESC) FROM diplo_scenar WHERE NOT aktivni), '[]'::jsonb) AS starsi
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
