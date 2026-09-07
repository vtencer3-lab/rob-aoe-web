-- Rozpracovaná sestava zápasu (koho Rob zrovna vybral, s barvou, týmem a
-- civilizací, v pořadí slotů) žije od teď u akce na serveru, ne v prohlížeči
-- jednoho admina. Dva admini s otevřenou stránkou tak vidí totéž a každé
-- kliknutí se přes SSE propíše všem. Vytvořením zápasu se vyprázdní.
ALTER TABLE akce ADD COLUMN skladani JSONB NOT NULL DEFAULT '[]'::jsonb;

-- „Uložit nastavení lobby“ = snímek nastavení, ke kterému se admin může
-- vrátit („Načíst uložené“). Živé nastavení (nastaveni_lobby) se mění
-- každým kliknutím; tenhle sloupec jen tlačítkem.
ALTER TABLE akce ADD COLUMN ulozene_nastaveni_lobby JSONB;
