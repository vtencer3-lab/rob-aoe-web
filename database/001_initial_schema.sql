CREATE TABLE player (
  steam_id        TEXT PRIMARY KEY,
  alias           TEXT,
  steam_name      TEXT,
  avatar_url      TEXT,
  country         TEXT,
  elo_1v1         INTEGER,
  elo_nejvyssi    INTEGER,
  odehrano_her    INTEGER,
  posledni_zapas  TIMESTAMPTZ,
  steam_hodiny    INTEGER,
  staty_stazeny_v TIMESTAMPTZ,
  staty_chyba     TEXT,
  je_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  vytvoren        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE session (
  sid       TEXT PRIMARY KEY,
  steam_id  TEXT NOT NULL REFERENCES player(steam_id) ON DELETE CASCADE,
  vytvorena TIMESTAMPTZ NOT NULL DEFAULT now(),
  plati_do  TIMESTAMPTZ NOT NULL
);

CREATE TABLE akce (
  id        SERIAL PRIMARY KEY,
  nazev     TEXT NOT NULL,
  stav      TEXT NOT NULL DEFAULT 'priprava',
  vytvorena TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE prihlaska (
  akce_id  INTEGER NOT NULL REFERENCES akce(id) ON DELETE CASCADE,
  steam_id TEXT NOT NULL REFERENCES player(steam_id) ON DELETE CASCADE,
  stav     TEXT NOT NULL DEFAULT 'prihlasen',
  kdy      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (akce_id, steam_id)
);

CREATE TABLE zapas (
  id          SERIAL PRIMARY KEY,
  akce_id     INTEGER NOT NULL REFERENCES akce(id) ON DELETE CASCADE,
  poradi      INTEGER NOT NULL,
  format      TEXT NOT NULL,
  stav        TEXT NOT NULL DEFAULT 'nachystany',
  nazev_lobby TEXT NOT NULL,
  heslo       TEXT NOT NULL,
  lobby_id    TEXT,
  vitezny_tym SMALLINT,
  zacatek     TIMESTAMPTZ,
  konec       TIMESTAMPTZ,
  vytvoren    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (akce_id, poradi)
);

CREATE TABLE ucastnik (
  zapas_id         INTEGER NOT NULL REFERENCES zapas(id) ON DELETE CASCADE,
  steam_id         TEXT NOT NULL REFERENCES player(steam_id),
  tym              SMALLINT NOT NULL,
  barva            SMALLINT NOT NULL,
  je_host          BOOLEAN NOT NULL DEFAULT FALSE,
  kliknul_pripojit TIMESTAMPTZ,
  PRIMARY KEY (zapas_id, steam_id)
);

CREATE TABLE udalost (
  id       BIGSERIAL PRIMARY KEY,
  akce_id  INTEGER REFERENCES akce(id) ON DELETE CASCADE,
  zapas_id INTEGER REFERENCES zapas(id) ON DELETE CASCADE,
  kdo      TEXT REFERENCES player(steam_id),
  co       TEXT NOT NULL,
  detail   JSONB,
  kdy      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX prihlaska_akce_idx ON prihlaska (akce_id);
CREATE INDEX zapas_akce_idx ON zapas (akce_id, poradi);
CREATE INDEX udalost_akce_idx ON udalost (akce_id, kdy DESC);
