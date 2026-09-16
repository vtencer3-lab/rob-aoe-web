import { useEffect, type ReactNode } from "react";
import { cesta } from "../cesty.js";

interface Props {
  /** Nadpis stránky; jde i do titulku záložky. */
  nazev: string;
  /** Datum poslední změny, česky vypsané („17. září 2026“). */
  zmeneno: string;
  children: ReactNode;
}

/**
 * Společný rám právních stránek (podmínky, soukromí): deska ve stylu zbytku
 * webu, nadpis, datum poslední změny a cesta zpátky. Obsah dodává volající —
 * jedna stránka je o pravidlech, druhá o datech, ale kabátek mají stejný
 * a nemá se psát dvakrát.
 */
export function PravniStranka({ nazev, zmeneno, children }: Props) {
  // Bez tohohle by v záložce svítilo obecné „Komunitní hry — RobDiesALot“
  // i na stránce o soukromí.
  useEffect(() => {
    document.title = `${nazev} — RobDiesALot`;
  }, [nazev]);

  return (
    <main>
      <section className="pravni-stranka">
        <h1>{nazev}</h1>
        {children}
        <p className="pravni-stranka-zmeneno">Poslední změna: {zmeneno}</p>
        <p className="pravni-stranka-zpet">
          <a href={cesta("/")}>← Zpátky na web</a>
        </p>
      </section>
    </main>
  );
}
