-- Cenzura si pamatuje původní znění (jen v databázi, do stavu nejde), aby
-- šlo dohledat, co kdo napsal; a zvonek si pamatuje, který admin zazvonil,
-- aby hráči okno řeklo, kdo ho shání.
ALTER TABLE zprava ADD COLUMN text_puvodni TEXT;
ALTER TABLE prihlaska ADD COLUMN svolal_steam_id TEXT REFERENCES player(steam_id);
