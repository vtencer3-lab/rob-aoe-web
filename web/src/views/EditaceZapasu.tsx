import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { jeAi } from "../../../src/shared/aiHraci.js";
import { doplnNastaveni, type NastaveniLobby as Nastaveni } from "../../../src/shared/lobbyKontrola.js";
import { zkontrolujSestavu } from "../../../src/shared/sestava.js";
import type { PlayerView, SestavaVstup, ZapasView } from "../../../src/shared/types.js";
import { useSkladani } from "../skladani.js";
import { useZamekScrollu } from "../zamekScrollu.js";
import { NastaveniLobby } from "./NastaveniLobby.js";
import { Potvrzeni } from "./Potvrzeni.js";
import { PreLobby } from "./PreLobby.js";
import { Skladani } from "./Skladani.js";

interface Props {
  zapas: ZapasView;
  /** Přihlášení do akce — z nich se skládá nová sestava. */
  prihlaseni: PlayerView[];
  onNastaveni: (nastaveni: Nastaveni) => Promise<unknown> | void;
  onNazev: (nazevLobby: string) => Promise<unknown> | void;
  onSestava: (sestava: SestavaVstup[]) => Promise<unknown> | void;
  onZavrit: () => void;
}

/** Jak dlouho po poslední změně se platný návrh propíše, dokud je okno otevřené. */
export const ODKLAD_PROPISU_MS = 1_200;

interface Navrh {
  nastaveni: Nastaveni;
  sestava: SestavaVstup[];
}

/**
 * Co v návrhu nesedí: klíče řádků, které se červeně zvýrazní. Sestava
 * (počty, barvy, týmy) se hlídá sdílenou kontrolou; z nastavení to, co
 * s ní souvisí — počet míst v lobby a obtížnost, když v sestavě sedí AI.
 */
export function chybyNavrhu(n: Navrh): { klice: string[]; sestava: string | null } {
  const klice: string[] = [];
  const sestava = zkontrolujSestavu(n.sestava);
  if (n.nastaveni.maxHracu !== null && n.nastaveni.maxHracu < n.sestava.length) klice.push("maxHracu");
  if (n.sestava.some((s) => jeAi(s.steamId)) && n.nastaveni.aiObtiznost === null) klice.push("aiObtiznost");
  return { klice, sestava };
}

function stejne(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Ozubené kolečko u zápasu: totéž, co při zakládání — vlevo sestava, vpravo
 * Game Settings, vpravo nahoře okno Pre-Lobby — jen nad jedním už založeným
 * zápasem. Změny žijí jako návrh v okně: platný návrh se propíše sám po
 * 1,2 s klidu, zavření okna (Uložit, klik vedle) ho propíše hned. Neplatný
 * návrh okno nepustí — chybné řádky zčervenají — a křížek se napřed zeptá,
 * jestli zahodit všechno z téhle seance: pak se vrátí stav z otevření okna.
 */
export function EditaceZapasu({ zapas, prihlaseni, onNastaveni, onNazev, onSestava, onZavrit }: Props) {
  const [preLobbyVidet, setPreLobbyVidet] = useState(false);
  const [ptaSeNaZahozeni, setPtaSeNaZahozeni] = useState(false);
  const [chyby, setChyby] = useState<{ klice: string[]; sestava: string | null } | null>(null);
  const okno = useRef<HTMLDivElement>(null);
  useZamekScrollu();

  // Stav při otevření — kam se vrátí „zahodit všechny změny“.
  const pocatek = useRef<Navrh>({
    nastaveni: doplnNastaveni(zapas.nastaveni as Partial<Nastaveni>),
    sestava: zapas.ucastnici.map((u) => ({ steamId: u.steamId, tym: u.tym, barva: u.barva, civ: u.civ ?? null })),
  });
  const [navrh, setNavrh] = useState<Navrh>(pocatek.current);
  // Co server naposledy dostal — ať se neposílá totéž dvakrát.
  const odeslano = useRef<Navrh>(pocatek.current);

  const skladani = useSkladani(prihlaseni, {
    hodnota: navrh.sestava,
    odesli: async (s) => setNavrh((n) => ({ ...n, sestava: s })),
  });

  const propis = (n: Navrh) => {
    if (!stejne(n.nastaveni, odeslano.current.nastaveni)) void onNastaveni(n.nastaveni);
    if (!stejne(n.sestava, odeslano.current.sestava)) void onSestava(n.sestava);
    odeslano.current = n;
  };

  // Odklad: platný návrh odejde 1,2 s po poslední změně, dokud je okno otevřené.
  useEffect(() => {
    const ch = chybyNavrhu(navrh);
    if (ch.sestava !== null || ch.klice.length > 0) return;
    const casovac = setTimeout(() => propis(navrh), ODKLAD_PROPISU_MS);
    return () => clearTimeout(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navrh]);

  // Červené zvýraznění: řádky nastavení podle data-klic, u sestavy souhrn.
  useEffect(() => {
    const el = okno.current;
    if (!el) return;
    for (const r of el.querySelectorAll(".chyba")) r.classList.remove("chyba");
    if (!chyby) return;
    for (const klic of chyby.klice) el.querySelector(`[data-klic="${klic}"]`)?.classList.add("chyba");
    if (chyby.klice.includes("maxHracu")) el.querySelector(".prava .prelobby-tlacitko")?.classList.add("chyba");
    if (chyby.sestava !== null) el.querySelector('[data-testid="souhrn-sestavy"]')?.classList.add("chyba");
  }, [chyby, preLobbyVidet]);

  /** Uložit / klik vedle: platný návrh hned propsat a zavřít, neplatný zvýraznit a zůstat. */
  const ulozitAZavrit = () => {
    const ch = chybyNavrhu(navrh);
    if (ch.sestava !== null || ch.klice.length > 0) {
      setChyby(ch);
      return;
    }
    propis(navrh);
    onZavrit();
  };

  /** Křížek: platný návrh = totéž co Uložit; neplatný = dotaz na zahození. */
  const krizek = () => {
    const ch = chybyNavrhu(navrh);
    if (ch.sestava === null && ch.klice.length === 0) {
      ulozitAZavrit();
      return;
    }
    setChyby(ch);
    setPtaSeNaZahozeni(true);
  };

  const zahodit = () => {
    setPtaSeNaZahozeni(false);
    // Co už za seanci odešlo, se vrátí na stav z otevření.
    propis(pocatek.current);
    onZavrit();
  };

  const nastaveni = navrh.nastaveni;
  const jeChyba = chyby !== null && (chyby.sestava !== null || chyby.klice.length > 0);

  return createPortal(
    <div
      className="prelobby-stin"
      data-testid="editace-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) ulozitAZavrit();
      }}
    >
      <div className="prelobby-okno editace-zapasu" role="dialog" aria-modal="true" aria-label={`Úprava zápasu #${zapas.poradi}`} data-testid="editace-zapasu" ref={okno}>
        <header className="hlavicka-akce">
          <h2>
            Zápas #{zapas.poradi} — {zapas.nazevLobby}
          </h2>
          <button type="button" className="zavrit" aria-label="Zavřít" onClick={krizek}>
            ✕
          </button>
        </header>
        {preLobbyVidet ? (
          <PreLobby
            nastaveni={nastaveni}
            nazevLobby={zapas.nazevLobby}
            heslo={zapas.heslo}
            onZmena={(n) => setNavrh((v) => ({ ...v, nastaveni: n }))}
            onNazev={onNazev}
            onZavrit={() => setPreLobbyVidet(false)}
          />
        ) : null}
        <div className="lobby-rozlozeni">
          <div className="leva">
            <Skladani skladani={skladani} sadaCivilizaci={nastaveni.sadaCivilizaci} bezTlacitka onVytvoritZapas={() => {}} />
            {/* Uložit sedí dole vlevo v rovině posledních zaškrtávátek vpravo,
                ať okno kvůli němu neroste. Chybová věta vedle něj. */}
            <div className="ulozit-radek">
              <button type="button" className="vytvorit" data-testid="ulozit-zapas" onClick={ulozitAZavrit}>
                Uložit
              </button>
              {jeChyba ? (
                <span className="chyba-text" role="alert">
                  {chyby?.sestava ?? "Nastavení lobby nesedí se sestavou (zvýrazněné řádky)."}
                </span>
              ) : null}
            </div>
          </div>
          <div className="prava">
            <button type="button" className="prelobby-tlacitko" onClick={() => setPreLobbyVidet(true)}>
              Pre-Lobby Nastavení
            </button>
            <NastaveniLobby zive={nastaveni as unknown as Record<string, unknown>} ulozene={null} onZmena={(n) => setNavrh((v) => ({ ...v, nastaveni: n }))} onUlozit={() => {}} bezResetu />
          </div>
        </div>
      </div>
      {ptaSeNaZahozeni ? (
        <Potvrzeni text="Chcete zahodit všechny změny?" potvrdit="Ano" zrusit="Ne" onPotvrdit={zahodit} onZrusit={() => setPtaSeNaZahozeni(false)} />
      ) : null}
    </div>,
    document.body,
  );
}
