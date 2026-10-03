-- Co GM ukazuje na mapě z běžící hry (uživatel 3. 10. 2026): krále a relikvie.
-- Přepínače pod mapou v pultu GM; platí i pro overlaye do OBS (`/obs/mapa`).
ALTER TABLE diplo_zapas
  ADD COLUMN mapa_kralove boolean NOT NULL DEFAULT true,
  ADD COLUMN mapa_relikvie boolean NOT NULL DEFAULT true;
