-- Nástupce po smrti Šaška prodává 1 relikvii (pokud mu neběží odpočet 7
-- relikvií; uživatel 3. 10. 2026). Připomínka nastupce_prodej si v `poradi`
-- pamatuje počitadlo prodejů ve chvíli smrti Šaška — splněno, když vzroste.
ALTER TABLE diplo_schopnost DROP CONSTRAINT diplo_schopnost_druh_check;
ALTER TABLE diplo_schopnost ADD CONSTRAINT diplo_schopnost_druh_check
  CHECK (druh IN ('sabotaz', 'informace', 'doplatek', 'kat_odmena', 'garda_role', 'sasek_prodej', 'nastupce_prodej'));
DROP INDEX diplo_schopnost_pripominka;
CREATE UNIQUE INDEX diplo_schopnost_pripominka ON diplo_schopnost (zapas_id, druh, hrac_id, cil_hrac_id)
  WHERE druh IN ('kat_odmena', 'garda_role', 'sasek_prodej', 'nastupce_prodej');
