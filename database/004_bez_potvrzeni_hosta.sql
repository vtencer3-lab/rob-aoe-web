-- Potvrzení hosta nezamykalo nic už od chvíle, kdy se Spectate začal řídit
-- výhradně existencí odkazu do lobby. Zbyla z něj informace, kterou nikdo
-- nečetl, a past: vložení nového odkazu ji tiše rušilo, takže host nevěděl,
-- že má potvrzovat znovu.
--
-- Kontrolu lobby dělá nadále Rob sám — vidí, že odkaz existuje, kdo na něj
-- klikl, a hlavně se může Spectatem podívat dovnitř vlastníma očima.
ALTER TABLE zapas DROP COLUMN host_potvrdil;
