-- Doplatek Žoldákovi za prodanou relikvii zakládá server sám z dat hry
-- (uživatel 3. 10. 2026): scénář za prodej pošle 4000 zlata a počítá prodeje
-- v proměnné pN_sell_relic; GM doplácí druhých 4000. `poradi` = kolikátý
-- prodej, každý jen jednou. Ruční žádost hráče (bez dat ze hry) má poradi NULL.
ALTER TABLE diplo_schopnost ADD COLUMN poradi INTEGER;
CREATE UNIQUE INDEX diplo_schopnost_doplatek ON diplo_schopnost (zapas_id, hrac_id, poradi) WHERE druh = 'doplatek' AND poradi IS NOT NULL;
