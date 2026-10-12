-- Kdo akci založil (uživatel 12. 10. 2026): zakladatel módu (ADMINI_MODU,
-- teď Jin pro Diplomacii) smí ukončit jen akci, kterou sám založil. Admin
-- dál ukončí jakoukoli. Starší akce autora nemají.
ALTER TABLE akce ADD COLUMN zakladatel TEXT REFERENCES player(hrac_id) ON DELETE SET NULL;
