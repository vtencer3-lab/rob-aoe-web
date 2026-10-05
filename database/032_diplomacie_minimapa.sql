-- Minimapa verze scénáře (mód Diplomacie): otisk obsahu do adresy obrázku
-- a příznak ručně nahraného obrázku ze hry.
--
-- Route minimapy posílá roční cache „immutable“ (obsah verze se nemění).
-- Jakmile se obrázek u verze vymění (1. 10. 2026: mapa ze hry místo
-- terénního renderu z rozboru), musí se změnit adresa, jinak prohlížeč
-- drží starý obrázek — proto otisk v adrese. Příznak `minimapa_vlastni`
-- říká, že obrázek už nese kosočtverce hráčů ze hry a web ke startům
-- kreslí jen jména. Dnešní verze dostanou otisk dopočtený.
ALTER TABLE diplo_scenar
  ADD COLUMN minimapa_otisk   TEXT,
  ADD COLUMN minimapa_vlastni BOOLEAN NOT NULL DEFAULT false;

UPDATE diplo_scenar
   SET minimapa_otisk = left(encode(sha256(minimapa), 'hex'), 16)
 WHERE minimapa IS NOT NULL;
