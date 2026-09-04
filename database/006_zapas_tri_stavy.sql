-- „nachystany“ znamenalo „Rob složil sestavu, nikdo to ještě nevidí“ a redakce
-- takový zápas ne-adminům nevydávala vůbec. Při první ostré zkoušce přes tunel
-- to dvakrát po sobě vypadalo jako porucha: admin zápas viděl, hráč ne, hostovi
-- nenaskočilo pole na odkaz a nic z toho nebylo vysvětlené. Zadavatel
-- viditelnost vědomě otevírá — sestava je vidět v okamžik, kdy vznikne.
--
-- „lobby_otevrena“ nastavoval server sám při vložení odkazu, takže se pozná
-- podle toho, že odkaz existuje. „vyhlaseny“ a „hraje_se“ byly jen kliky.
UPDATE zapas SET stav = 'bezi' WHERE stav NOT IN ('dohrano', 'zruseny');
ALTER TABLE zapas ALTER COLUMN stav SET DEFAULT 'bezi';

-- Plnil ho jedině přechod na „hraje_se“; bez něj by zůstal navždy NULL. Kdy
-- zápas vznikl, drží vytvoren. Sloupec konec zůstává — píše ho zápis výsledku
-- a je to jediné časové razítko, které bude budoucí statistika potřebovat.
ALTER TABLE zapas DROP COLUMN zacatek;
