-- Mód Diplomacie (spec §4.4, §5). Verze scénáře se nemažou: jsou zálohou
-- a zápas si otiskne tu, kterou hrál.
CREATE TABLE diplo_scenar (
  id             SERIAL PRIMARY KEY,
  jmeno_souboru  TEXT NOT NULL,
  sha256         TEXT NOT NULL UNIQUE,
  data           BYTEA NOT NULL,
  rozbor         JSONB,
  chyba_rozboru  TEXT,
  minimapa       BYTEA,
  nahral_hrac_id TEXT NOT NULL REFERENCES player(hrac_id),
  nahrano_v      TIMESTAMPTZ NOT NULL DEFAULT now(),
  poznamka       TEXT,
  aktivni        BOOLEAN NOT NULL DEFAULT false,
  CHECK (NOT aktivni OR rozbor IS NOT NULL)
);
CREATE UNIQUE INDEX diplo_scenar_jeden_aktivni ON diplo_scenar ((true)) WHERE aktivni;

-- GM se neukládá: je to vždy účastník zápasu na šedé (barva 7, hráč „GM“
-- ve scénáři). Admin ho v přípravě vymění změnou sestavy a nic se nerozejde.
CREATE TABLE diplo_zapas (
  zapas_id         INTEGER PRIMARY KEY REFERENCES zapas(id) ON DELETE CASCADE,
  stav             TEXT NOT NULL DEFAULT 'priprava' CHECK (stav IN ('priprava', 'losovano', 'rozeslano')),
  nastupce_hrac_id TEXT REFERENCES player(hrac_id),
  scenar_id        INTEGER REFERENCES diplo_scenar(id),
  rozeslano_v      TIMESTAMPTZ,
  upraveno_v       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diplo_role (
  zapas_id              INTEGER NOT NULL REFERENCES diplo_zapas(zapas_id) ON DELETE CASCADE,
  hrac_id               TEXT NOT NULL REFERENCES player(hrac_id),
  role                  TEXT NOT NULL CHECK (role IN ('nastupce', 'garda', 'najezdnik', 'sasek', 'zoldak', 'kat')),
  cil_hrac_id           TEXT REFERENCES player(hrac_id),
  puvodni_role          TEXT,
  upraveno_po_rozeslani BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (zapas_id, hrac_id)
);
