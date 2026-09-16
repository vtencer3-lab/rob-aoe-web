-- database/029_hra_hrana_v.sql
-- Ikona vlastnictví u Microsoft hráčů dosud tvrdila „hrál“ i tomu, kdo hru
-- naposledy spustil dávno a dnes už se k ní nedostane (Game Pass vypršel).
-- Xbox posílá datum posledního spuštění (titleHistory.lastTimePlayed) — to
-- jde uložit jako holý fakt, práh čerstvosti si počítá frontend (viz
-- OdznakHry v SeznamPrihlasenych.tsx), ať se dá měnit na jednom místě.
ALTER TABLE player ADD COLUMN hra_hrana_v TIMESTAMPTZ;
