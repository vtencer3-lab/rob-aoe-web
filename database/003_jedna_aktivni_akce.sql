-- Celá aplikace předpokládá, že běží nejvýš jedna nedokončená akce, ale nic to
-- doteď nevynucovalo: akce.stav neměl žádné omezení, createAkce vkládá
-- bezpodmínečně a getAktivniAkce si jednu jen VYBERE
-- (WHERE stav <> 'konec' ORDER BY id DESC LIMIT 1). Rob přitom může úplně
-- běžně založit příští týden dřív, než tenhle večer uzavře.
--
-- Následek není únik tajemství (redakce běží pro každého diváka a každý zápas
-- zvlášť na každé cestě), ale tiché zamrznutí: odběratelé SSE jsou přihlášení
-- na akce.id z okamžiku připojení, takže broadcast nové akce jde na kanál, na
-- kterém nikdo není. Každá otevřená stránka zůstane stát na posledním stavu,
-- bez chyby, zatímco aplikace už ukazuje novou prázdnou akci. Uprostřed
-- vysílání nediagnostikovatelné.

-- Databáze, která invariant už porušuje, se nejdřív srovná. Otevřená zůstane ta
-- s nejvyšším id — přesně ta, kterou getAktivniAkce() jako jedinou vracelo,
-- takže se chování nemění, jen se to zapíše. Celá migrace běží v jedné
-- transakci (scripts/migrate.ts), takže úklid i index projdou spolu, nebo se
-- nestane vůbec nic; napůl zmigrovaná databáze nevznikne.
UPDATE akce
   SET stav = 'konec'
 WHERE stav <> 'konec'
   AND id < (SELECT MAX(id) FROM akce WHERE stav <> 'konec');

CREATE UNIQUE INDEX jedna_aktivni_akce ON akce ((true)) WHERE stav <> 'konec';
