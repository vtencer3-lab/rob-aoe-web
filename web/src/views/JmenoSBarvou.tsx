import { Fragment, type ReactNode } from "react";
import { spojkaVyctu, vetaOViteze, type ClenStrany } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, type Barva, type UcastnikView, type Vitez } from "../../../src/shared/types.js";
import { jmenoHrace, jmenoVZapasu } from "../zapas.js";

/** Co o účastníkovi stačí vědět, aby šel pojmenovat i s barvou. */
type Pojmenovatelny = Pick<UcastnikView, "hracId" | "alias" | "platformaJmeno" | "barva">;

/**
 * Čtvereček barvy hráče v zápase. Barvu nese sám (`swatch barva-N`), ne
 * předek: karta hráče je `.karta.barva-N` a barva přes předka by v ní
 * přebarvila všechny čtverečky na barvu karty. Čtečkám nic neříká — jméno
 * hned vedle stačí; bublina s názvem barvy je pro ty, kdo barvy hůř rozlišují.
 * Uvnitř je číslo barvy (uživatel 3. 10. 2026 — „pN“ ve hře), kreslí ho CSS
 * z `data-cislo`: textu jména (a čtečkám) nic nepřidá.
 */
export function ZnakBarvy({ barva }: { barva: Barva }) {
  return <span className={`swatch barva-${barva}`} data-cislo={barva} title={BARVA_NAZEV[barva]} aria-hidden="true" />;
}

/**
 * Jméno hráče se čtverečkem jeho barvy v zápase — všude, kde se o účastníkovi
 * mluví ve větě (uživatel 2. 10. 2026): hráči se ve hře poznávají podle
 * barvy, ne podle jména. Bez známé barvy (neznámé id, tým s víc barvami)
 * zůstane holý text.
 */
export function JmenoSBarvou({ barva, children }: { barva: Barva | null | undefined; children: ReactNode }) {
  if (barva === null || barva === undefined) return <>{children}</>;
  return (
    <span className="jmeno-s-barvou">
      <ZnakBarvy barva={barva} />
      {children}
    </span>
  );
}

/**
 * Účastník zápasu podle id se svou barvou. Stejně pojmenované AI očima
 * rozliší číslo ve čtverečku, takže „(pN)“ z `jmenoVZapasu` vidět není;
 * čtvereček je ale pro čtečky skrytý, proto jim „(pN)“ zůstává (`sr-only`).
 */
export function JmenoUcastnika({ ucastnici, hracId }: { ucastnici: readonly Pojmenovatelny[]; hracId: string }) {
  const u = ucastnici.find((x) => x.hracId === hracId);
  const cele = jmenoVZapasu(ucastnici, hracId);
  if (!u) return <>{cele}</>;
  const jmeno = jmenoHrace(u);
  return (
    <JmenoSBarvou barva={u.barva}>
      {jmeno}
      {cele !== jmeno ? <span className="sr-only">{cele.slice(jmeno.length)}</span> : null}
    </JmenoSBarvou>
  );
}

/** Víc účastníků za sebou, každý se svou barvou: „Tonda, Zdena“. */
export function VycetUcastniku({ ucastnici, hraci, oddelovac = ", " }: { ucastnici: readonly Pojmenovatelny[]; hraci: readonly string[]; oddelovac?: string }) {
  return (
    <>
      {hraci.map((hracId, i) => (
        <Fragment key={hracId}>
          {i > 0 ? oddelovac : null}
          <JmenoUcastnika ucastnici={ucastnici} hracId={hracId} />
        </Fragment>
      ))}
    </>
  );
}

/** Věta o vítězi („vyhráli X, Y a Z“, „vyhrál modrý tým“) s barvou u jmen; slova skládá sdílené `vetaOViteze`. */
export function VitezVeVete({ ucastnici, vitez }: { ucastnici: ClenStrany[]; vitez: Vitez }) {
  const { sloveso, jmenovani } = vetaOViteze(ucastnici, vitez);
  return (
    <>
      {sloveso}{" "}
      {jmenovani.map((j, i) => (
        <Fragment key={i}>
          {spojkaVyctu(i, jmenovani.length)}
          <JmenoSBarvou barva={j.barva}>{j.jmeno}</JmenoSBarvou>
        </Fragment>
      ))}
    </>
  );
}
