import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Me } from "./api.js";
import { cesta } from "./cesty.js";
import { doplnNastaveni, type NastaveniLobby } from "../../src/shared/lobbyKontrola.js";
import { VERZE } from "../../src/shared/verze.js";
import { popisZmenyNastaveni, popisZmenySestavy, type Zaznam } from "./historie.js";
import { Toasty, type Toast } from "./views/Toasty.js";
import { useAkceStav } from "./useAkceStav.js";
import { useSkladani } from "./skladani.js";
import { jmenoHrace, mojeZapasy, mujUcastnik, verejneZapasy } from "./zapas.js";
import { KartaHrace } from "./views/KartaHrace.js";
import { ObrazovkaHosta } from "./views/ObrazovkaHosta.js";
import { Prepinac } from "./views/Prepinac.js";
import { Rezie } from "./views/Rezie.js";
import { SeznamPrihlasenych } from "./views/SeznamPrihlasenych.js";
import { Skladani } from "./views/Skladani.js";
import { SpravaAkce } from "./views/SpravaAkce.js";
import { VerejnyZapas } from "./views/VerejnyZapas.js";
import { ZkusebniLista } from "./views/ZkusebniLista.js";
/** Easter egg: klik na Robovo jméno v záhlaví přehraje crashout. */
import crashoutUrl from "./assets/crashout.mp3";

/** Přepínač, který si prohlížeč pamatuje (debug mód, pohled uživatele). */
function useUlozenyPrepinac(klic: string): [boolean, (v: boolean) => void] {
  const [hodnota, setHodnota] = useState(() => {
    try {
      return localStorage.getItem(klic) === "1";
    } catch {
      return false;
    }
  });
  return [
    hodnota,
    (v) => {
      setHodnota(v);
      try {
        localStorage.setItem(klic, v ? "1" : "0");
      } catch {
        // Bez úložiště se přepínač po obnovení stránky vrátí na výchozí.
      }
    },
  ];
}

export function App() {
  const [me, setMe] = useState<Me["hrac"]>(null);
  const [zkusebniHraci, setZkusebniHraci] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  // Jen pro adminy: „User View“ schová všechno adminské, ať Rob vidí stránku
  // očima hráče; debug mód ukáže tlačítka zkušebních hráčů.
  const [pohledUzivatele, setPohledUzivatele] = useUlozenyPrepinac("rezie.pohled-uzivatele");
  const [ladeni, setLadeni] = useUlozenyPrepinac("rezie.ladeni");
  const { stav, spojeno, obnov } = useAkceStav();

  const akce = stav?.akce ?? null;
  const admin = Boolean(me?.jeAdmin) && !pohledUzivatele;

  // Historie kroků pro Ctrl+Z / Ctrl+Y: jen vlastní změny sestavy a nastavení
  // lobby. Zásobníky jsou v refech, ať je klávesová zkratka vidí aktuální.
  const zpetZasobnik = useRef<Zaznam[]>([]);
  const znovuZasobnik = useRef<Zaznam[]>([]);
  const [toasty, setToasty] = useState<Toast[]>([]);
  const dalsiToastId = useRef(1);
  const [zvyrazneni, setZvyrazneni] = useState<{ druh: Zaznam["druh"]; cil: string | null; cas: number } | null>(null);
  const zavriToast = useCallback((id: number) => setToasty((t) => t.filter((x) => x.id !== id)), []);
  const pridejToast = (text: string) => {
    const id = dalsiToastId.current++;
    setToasty((t) => [...t.slice(-3), { id, text }]);
  };
  const zvyrazni = (druh: Zaznam["druh"], cil: string | null) => setZvyrazneni({ druh, cil, cas: Date.now() });
  // Kdo je v běžícím zápase — v tabulce přihlášených dostane zkřížené meče.
  const vZapase = new Map<string, number>();
  for (const z of stav?.zapasy ?? []) {
    if (z.stav === "bezi") for (const u of z.ucastnici) vZapase.set(u.steamId, z.poradi);
  }

  // Rozpracovaná sestava žije u akce na serveru a přes SSE ji vidí všichni
  // admini; tady se jen ukazuje a každé kliknutí odchází zpátky.
  const skladani = useSkladani(
    stav?.prihlaseni ?? [],
    akce
      ? {
          hodnota: akce.skladani ?? [],
          odesli: (sestava) => api.skladani(akce.id, sestava),
          naZmenu: (pred, po) => {
            const { text, cil } = popisZmenySestavy(pred, po, jmenoPodleIdRef.current);
            zaznamenejRef.current({ druh: "skladani", pred, po, text, cil });
          },
        }
      : undefined,
  );
  // useSkladani se volá dřív, než jsou definované pomocné funkce níž — refy to překlenou.
  const jmenoPodleIdRef = useRef<(steamId: string) => string>((id) => id);
  const zaznamenejRef = useRef<(z: Zaznam) => void>(() => {});

  useEffect(() => {
    void api.me().then((odpoved) => setMe(odpoved.hrac));
    void api
      .nastaveni()
      .then((n) => setZkusebniHraci(n.zkusebniHraci))
      .catch(() => {});
  }, []);

  const jsemPrihlaseny = Boolean(me && stav?.prihlaseni.some((h) => h.steamId === me.steamId));
  const jmenoPodleId = (steamId: string) => {
    const h = stav?.prihlaseni.find((x) => x.steamId === steamId);
    return h ? jmenoHrace(h) : steamId;
  };

  /** Nasadí stav z kroku (před = zpět, po = znovu) a ohlásí to. */
  const pouzij = (z: Zaznam, smer: "zpet" | "znovu") => {
    if (!akce) return;
    const predpona = smer === "zpet" ? "Zpět" : "Znovu";
    if (z.druh === "skladani") {
      // Krok je platný jen pro hráče, kteří jsou pořád přihlášení; ostatní se
      // vynechají a toast to řekne, místo aby se někdo vrátil natvrdo.
      const cilovy = smer === "zpet" ? z.pred : z.po;
      const prihlaseniIds = new Set((stav?.prihlaseni ?? []).map((h) => h.steamId));
      const chybejici = cilovy.filter((v) => !prihlaseniIds.has(v.steamId)).map((v) => jmenoPodleId(v.steamId));
      skladani.nastavCelou(cilovy.filter((v) => prihlaseniIds.has(v.steamId)));
      zvyrazni(z.druh, z.cil);
      pridejToast(chybejici.length > 0 ? `${predpona}: ${z.text} — ${chybejici.join(", ")} už není přihlášený, vynechán` : `${predpona}: ${z.text}`);
      return;
    }
    const cilovy = smer === "zpet" ? z.pred : z.po;
    void hlidej(() => api.nastaveniLobby(akce.id, cilovy));
    zvyrazni(z.druh, z.cil);
    pridejToast(`${predpona}: ${z.text}`);
  };
  const zpet = () => {
    const z = zpetZasobnik.current.pop();
    if (!z) return;
    znovuZasobnik.current.push(z);
    pouzij(z, "zpet");
  };
  const znovu = () => {
    const z = znovuZasobnik.current.pop();
    if (!z) return;
    zpetZasobnik.current.push(z);
    pouzij(z, "znovu");
  };
  // Běžná změna se jen zapíše do historie — toast i zvýraznění patří až
  // ke kroku zpět/znovu, jinak by každé kliknutí blikalo a hlásilo.
  const zaznamenej = (z: Zaznam) => {
    zpetZasobnik.current.push(z);
    znovuZasobnik.current = [];
  };
  jmenoPodleIdRef.current = jmenoPodleId;
  zaznamenejRef.current = zaznamenej;

  const zpetRef = useRef(zpet);
  const znovuRef = useRef(znovu);
  zpetRef.current = zpet;
  znovuRef.current = znovu;
  useEffect(() => {
    if (!admin) return;
    const naKlavesu = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // V textovém poli patří Ctrl+Z prohlížeči (vrací psaní).
      const cil = e.target;
      if (cil instanceof HTMLElement && cil.matches("input[type='text'], input[type='number'], textarea")) return;
      const klavesa = e.key.toLowerCase();
      if (klavesa === "z" && !e.shiftKey) {
        e.preventDefault();
        zpetRef.current();
      } else if (klavesa === "y" || (klavesa === "z" && e.shiftKey)) {
        e.preventDefault();
        znovuRef.current();
      }
    };
    window.addEventListener("keydown", naKlavesu);
    return () => window.removeEventListener("keydown", naKlavesu);
  }, [admin]);

  async function prepnout() {
    if (!akce || !me) return;
    try {
      setChyba(null);
      await (jsemPrihlaseny ? api.odhlasit(akce.id) : api.prihlasit(akce.id));
      void obnov();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : "Nepovedlo se to.");
    }
  }

  async function hlidej(akce: () => Promise<unknown>) {
    try {
      setChyba(null);
      await akce();
      // Stav si po vlastní akci dočíst hned: kdyby stream zrovna mlčel,
      // tlačítko by jinak zůstalo stát, jako by se nic nestalo.
      void obnov();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : "Nepovedlo se to.");
    }
  }

  return (
    <main>
      <header>
        <h1>
          Komunitní hry —{" "}
          <button
            type="button"
            className="jmeno-roba"
            title="RobDiesALot"
            onClick={() => {
              // Prohlížeč bez autoplay nebo bez zvuku: ticho, žádná chyba.
              void new Audio(crashoutUrl).play().catch(() => {});
            }}
          >
            RobDiesALot
          </button>
        </h1>
        <div className="hlavicka-vpravo">
          {me ? (
            <span>
              {jmenoHrace(me)}{" "}
              <button onClick={() => void api.odhlasitSe().then(() => setMe(null))}>Odhlásit</button>
            </span>
          ) : (
            <a className="tlacitko" href={cesta("/api/auth/steam")}>
              Přihlásit se přes Steam
            </a>
          )}
          {/* Přepínač pohledu pod řádkem se jménem, jen pro adminy. */}
          {me?.jeAdmin ? (
            <Prepinac
              popisek="Pohled uživatele"
              vlevo="Admin View"
              vpravo="User View"
              zapnuto={pohledUzivatele}
              onZmena={setPohledUzivatele}
              testId="prepinac-pohledu"
            />
          ) : null}
        </div>
      </header>

      {!spojeno ? <p className="spojeni">Obnovuji spojení…</p> : null}
      {chyba ? <p className="chyba">{chyba}</p> : null}

      {/* Mimo větev `akce ?` níže schválně: bez tohohle by Rob neměl akci jak
          založit — dokud žádná neběží, celý panel režie se nevykresluje. */}
      {admin ? (
        <SpravaAkce
          akce={akce}
          ladeni={ladeni}
          onZalozit={(nazev) => void hlidej(() => api.vytvoritAkce(nazev))}
          onStav={(novyStav) => {
            if (akce) void hlidej(() => api.akceStav(akce.id, novyStav));
          }}
          onNastaveniLobby={(n) => {
            if (!akce) return;
            const pred = doplnNastaveni(akce.nastaveniLobby as Partial<NastaveniLobby>);
            const { text, cil } = popisZmenyNastaveni(pred, n);
            if (cil) zaznamenej({ druh: "nastaveni", pred, po: n, text, cil });
            void hlidej(() => api.nastaveniLobby(akce.id, n));
          }}
          zvyraznitNastaveni={zvyrazneni?.druh === "nastaveni" ? zvyrazneni : null}
          onUlozitNastaveni={() => {
            if (akce) void hlidej(() => api.ulozitNastaveniLobby(akce.id));
          }}
          zkusebni={
            zkusebniHraci && akce
              ? {
                  onPridat: () => void hlidej(() => api.pridatZkusebniho(akce.id)),
                  onOdebrat: () => void hlidej(() => api.odebratZkusebni(akce.id)),
                }
              : undefined
          }
        >
          {akce ? (
            <Skladani
              skladani={skladani}
              onVytvoritZapas={(sestava) => void hlidej(() => api.vytvoritZapas(akce.id, sestava))}
              sadaCivilizaci={doplnNastaveni(akce.nastaveniLobby as Partial<NastaveniLobby>).sadaCivilizaci}
              zvyraznit={zvyrazneni?.druh === "skladani" ? zvyrazneni : null}
            />
          ) : null}
        </SpravaAkce>
      ) : null}

      {akce ? (
        <>
          {/* Admin má název akce v záhlaví panelu; ostatním zůstává tady. */}
          {!admin ? <h2>{akce.nazev}</h2> : null}
          {/* Existující akce sama o sobě znamená „hlásit se lze“ — skončenou
              akci server do stavu vůbec neposílá. */}
          {me ? (
            <button onClick={() => void prepnout()}>
              {jsemPrihlaseny ? "Odhlásit se z akce" : "Přihlásit se do akce"}
            </button>
          ) : null}
          <h3 className="nadpis-seznamu">Přihlášení hráči</h3>
          <SeznamPrihlasenych prihlaseni={stav?.prihlaseni ?? []} skladani={admin ? skladani : undefined} vZapase={vZapase} />
          {admin && stav ? (
            <Rezie
              stav={stav}
              onStav={(zapasId, novyStav) => void hlidej(() => api.zapasStav(zapasId, novyStav))}
              onSmazat={(zapasId) => void hlidej(() => api.smazatZapas(zapasId))}
              onVysledek={(zapasId, vitez) => void hlidej(() => api.vysledek(zapasId, vitez))}
              onHost={(zapasId, steamId) => void hlidej(() => api.zmenitHosta(zapasId, steamId))}
              onKontrolaLobby={(id) => api.kontrolaLobby(id)}
            />
          ) : null}
          {me
            ? mojeZapasy(stav?.zapasy ?? [], me.steamId).map((zapas) =>
                mujUcastnik(zapas, me.steamId)?.jeHost ? (
                  <ObrazovkaHosta
                    key={zapas.id}
                    zapas={zapas}
                    ja={me.steamId}
                    onHledatLobby={(id) => api.hledatLobby(id)}
                    onKontrolaLobby={(id) => api.kontrolaLobby(id)}
                  />
                ) : (
                  <KartaHrace
                    key={zapas.id}
                    zapas={zapas}
                    ja={me.steamId}
                    onPripojit={(id) => void hlidej(() => api.pripojeni(id))}
                    onHledatLobby={(id) => api.hledatLobby(id)}
                  />
                ),
              )
            : null}
          {/* Zápas, na který divák nemá vlastní kartu. Anonyma i nehrajícího
              diváka do 5. 9. 2026 shodily dva filtry naráz (`me ?` a
              mojeZapasy()), takže složený zápas neviděl nikdo kromě hráčů
              a admina — přestože ho server posílá všem a jen zaslepí
              tajemství. */}
          {verejneZapasy(stav?.zapasy ?? [], me?.steamId ?? null).map((zapas) => (
            <VerejnyZapas key={zapas.id} zapas={zapas} ja={me?.steamId ?? null} />
          ))}
        </>
      ) : (
        <p className="prazdno">Právě neběží žádná akce.</p>
      )}

      <ZkusebniLista jaSteamId={me?.steamId ?? null} />
      {admin ? <Toasty toasty={toasty} onZavrit={zavriToast} /> : null}
      {/* Verze v patičce: po nasazení se jedním pohledem pozná, jestli
          prohlížeč drží nový build, nebo starý z mezipaměti. Vedle ní má
          admin přepínač debug módu. */}
      <footer className="verze">
        {me?.jeAdmin ? (
          <Prepinac popisek="Debug mód" vlevo="" vpravo="Debug" zapnuto={ladeni} onZmena={setLadeni} testId="prepinac-ladeni" />
        ) : null}
        <span data-testid="verze">v{VERZE}</span>
      </footer>
    </main>
  );
}
