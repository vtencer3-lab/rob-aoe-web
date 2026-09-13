import { useEffect } from "react";

/** Kolik modálních oken je otevřených; scroll stránky se vrátí až s posledním. */
let otevrenych = 0;

/**
 * Otevřené modální okno zamkne rolování hlavní stránky (uživatel: „teď můžu
 * scrollovat na hlavním webu, zatímco mám otevřený tohle modální okno“).
 * Počítá vnořená okna (Pre-Lobby nad úpravou zápasu), takže se zámek pustí
 * až se zavřením posledního.
 */
export function useZamekScrollu(): void {
  useEffect(() => {
    otevrenych += 1;
    document.body.classList.add("bez-scrollu");
    return () => {
      otevrenych -= 1;
      if (otevrenych <= 0) {
        otevrenych = 0;
        document.body.classList.remove("bez-scrollu");
      }
    };
  }, []);
}
