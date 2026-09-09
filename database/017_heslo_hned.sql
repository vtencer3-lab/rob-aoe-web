-- Heslo příští lobby má být připravené od začátku, ne až si o něj někdo
-- řekne: okno Pre-Lobby ho ukazuje k opsání do hry, takže prázdné pole by
-- znamenalo, že se čeká na kliknutí, o kterém nikdo neví.
--
-- Nové akce si ho berou rovnou při založení (db/events.createAkce); tahle
-- migrace doplní ty, které běžely dřív. Čtyřmístný PIN jako generatePassword.
UPDATE akce
   SET pristi_heslo = lpad((floor(random() * 10000))::int::text, 4, '0')
 WHERE pristi_heslo IS NULL;
