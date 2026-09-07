-- Všechny žebříčky hráče, jak je ukazuje hra po najetí na jméno v lobby:
-- pole {id, rating, nejvyssi, poradi, vyhry, prohry}. Sloupce elo_1v1 a
-- spol. zůstávají pro tabulku přihlášených (1v1 Random Map), tohle je
-- pro kartu se statistikami. Plní se při obnově statistik z Worlds Edge.
ALTER TABLE player ADD COLUMN zebricky JSONB;
