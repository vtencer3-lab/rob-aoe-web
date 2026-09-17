-- database/028_platforma_jmeno.sql
-- Jméno z platformy a vlastnictví hry přestávají být vázané na Steam: obojí
-- se u hráče z Microsoft Store plní stejně, jen z jiného zdroje. Hodiny
-- zůstávají steam_hodiny — ty Microsoft nezveřejňuje vůbec.
ALTER TABLE player RENAME COLUMN steam_name TO platforma_jmeno;
ALTER TABLE player RENAME COLUMN steam_hra  TO hra_vlastnictvi;
