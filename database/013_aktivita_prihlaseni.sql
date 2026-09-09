-- Přihlášený hráč po čase ztmavne a spadne na konec seznamu, ať Rob pozná,
-- kdo u počítače opravdu sedí. `aktivni_do` je okamžik, kdy se to stane;
-- tlačítko „Jsem tu!“ i kliknutí do stránky ho posouvají dopředu.
--
-- Existující přihlášky dostanou plnou lhůtu: v půlce večera by jinak všichni
-- naráz zešedli jen kvůli nasazení.
ALTER TABLE prihlaska
  ADD COLUMN aktivni_do    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  -- Poslední přijatý puls z prohlížeče. Drží odstup mezi automatickými
  -- prodlouženími, aby trojí kliknutí neudělalo z pěti minut patnáct.
  ADD COLUMN posledni_puls TIMESTAMPTZ;
