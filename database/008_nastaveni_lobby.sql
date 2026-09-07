-- Očekávané nastavení lobby pro kontrolu „Zkontrolovat lobby“: mapa, velikost,
-- rychlost, populace, victory, cheaty. Drží se u akce jako JSON, protože je to
-- pár hodnot, které Rob nastaví jednou za večer, a tvar se bude ještě hýbat
-- podle toho, co se ukáže jako užitečné. Chybějící klíče doplní kód výchozími
-- hodnotami (src/shared/lobbyKontrola.ts).
ALTER TABLE akce ADD COLUMN nastaveni_lobby JSONB NOT NULL DEFAULT '{}'::jsonb;
