-- Schopnosti rolí a připomínky pro GM (uživatel 3. 10. 2026).
-- Hráč z karty žádá (Sabotáž Nájezdníka, informace Šaška, doplatek Žoldáka
-- za relikvii), GM v pultu potvrdí nebo zamítne. Připomínky ze hry
-- (kat_odmena: Katovi 2000 zlata za padlého, garda_role: Gardě roli
-- padlého; sasek_prodej: po smrti Nástupce Šašek prodává relikvie, pokud
-- sám nemá běžící odpočet 7 relikvií) zakládá server z dat hry, GM je
-- odklikne jako vyřízené.
CREATE TABLE diplo_schopnost (
  id          SERIAL PRIMARY KEY,
  zapas_id    INTEGER NOT NULL REFERENCES diplo_zapas(zapas_id) ON DELETE CASCADE,
  hrac_id     TEXT NOT NULL,
  druh        TEXT NOT NULL CHECK (druh IN ('sabotaz', 'informace', 'doplatek', 'kat_odmena', 'garda_role', 'sasek_prodej')),
  cil_hrac_id TEXT,
  stav        TEXT NOT NULL DEFAULT 'ceka' CHECK (stav IN ('ceka', 'potvrzeno', 'zamitnuto')),
  vytvoreno_v TIMESTAMPTZ NOT NULL DEFAULT now(),
  vyrizeno_v  TIMESTAMPTZ
);
CREATE INDEX diplo_schopnost_zapas ON diplo_schopnost (zapas_id, id);
-- Připomínka k jednomu padlému jen jednou, i když hra hlásí pád každou sekundu.
CREATE UNIQUE INDEX diplo_schopnost_pripominka ON diplo_schopnost (zapas_id, druh, hrac_id, cil_hrac_id) WHERE druh IN ('kat_odmena', 'garda_role', 'sasek_prodej');

-- Šašek se po smrti Gardy tajně stává Gardou: role = 'garda', puvodni_role
-- = 'sasek' (sloupec z migrace 031). promena_videna = hráč už na kartě
-- klikl na „Královská garda padla“; do té doby karta ukazuje Šaška ztlumeně.
ALTER TABLE diplo_role ADD COLUMN promena_videna BOOLEAN NOT NULL DEFAULT true;
UPDATE diplo_role SET puvodni_role = NULL;
