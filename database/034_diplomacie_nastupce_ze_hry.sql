-- Most ke hře: koho hra určila za Nástupce císaře naposledy (hrac_id, jinak
-- NULL). Server podle toho pozná, že hra říká pořád totéž a GM mezitím
-- vybral někoho jiného — ruční volbu pak nepřepíše. Dřív to drželo jen
-- v paměti procesu a první snímek po restartu serveru volbu GM přepsal.
ALTER TABLE diplo_zapas ADD COLUMN nastupce_ze_hry TEXT;
