-- Heslo příští lobby vzniká napřed, ne až se zápas zakládá.
--
-- Rob si v okně „Pre-Lobby Nastavení“ chystá lobby dřív, než ji ve hře
-- založí: opisuje do hry jméno i heslo. Dokud heslo vznikalo až v
-- createZapas, nebylo co opsat — okno by ukázalo prázdno a hráči by pak
-- dostali jiné heslo, než jaké host do hry naklikal.
--
-- Drží se u akce, ne u zápasu: patří budoucí lobby, která ještě neexistuje.
-- Zápas si ho při založení vezme a hned se připraví další.
ALTER TABLE akce ADD COLUMN pristi_heslo TEXT;
