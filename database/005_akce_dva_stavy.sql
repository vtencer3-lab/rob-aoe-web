-- Pět stavů akce bylo navržených pro turnaj o tuctu zápasů. Rob hraje jeden
-- večer a obvykle jednu hru, takže „priprava“, „prihlasovani“ a „zavreno“ byly
-- jen kliky navíc, na kterých se dalo v přímém přenosu zaseknout. Zbývá „bezi“
-- a „konec“, a přihlašování je otevřené po celou dobu — kdo dorazí pozdě,
-- hlásí se i uprostřed večera.
--
-- Index jedna_aktivni_akce z migrace 003 stojí na stav <> 'konec', takže po
-- slití platí dál a invariant „nejvýš jedna otevřená akce“ zůstává vynucený
-- databází, ne domluvou.
UPDATE akce SET stav = 'bezi' WHERE stav <> 'konec';
ALTER TABLE akce ALTER COLUMN stav SET DEFAULT 'bezi';
