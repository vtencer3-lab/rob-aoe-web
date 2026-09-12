import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Me } from "./api.js";
import { cesta } from "./cesty.js";
import { doplnNastaveni, type NastaveniLobby } from "../../src/shared/lobbyKontrola.js";
import { VERZE } from "../../src/shared/verze.js";
import type { Vitez, ZapasView } from "../../src/shared/types.js";
import { popisZmenyNastaveni, popisZmenySestavy, type Zaznam } from "./historie.js";
import { Toasty, type Toast } from "./views/Toasty.js";
import { useAkceStav } from "./useAkceStav.js";
import { useSkladani } from "./skladani.js";
import { useZmenaVysky } from "./vyska.js";
import { jeVeHre, jmenoHrace, mojeZapasy, mujUcastnik, verejneZapasy } from "./zapas.js";
import { Chat } from "./views/Chat.js";
import { EditaceZapasu } from "./views/EditaceZapasu.js";
import { NastaveniUzivatele } from "./views/NastaveniUzivatele.js";
import poplachUrl from "./assets/poplach.mp3";
import { hlasitost as nactiHlasitost } from "./zvuk.js";
import { KartaHrace } from "./views/KartaHrace.js";
import { ObrazovkaHosta } from "./views/ObrazovkaHosta.js";
import { Prepinac } from "./views/Prepinac.js";
import { NazevAkce } from "./views/NazevAkce.js";
import { HistorieZapasu, Rezie } from "./views/Rezie.js";
import { SeznamPrihlasenych } from "./views/SeznamPrihlasenych.js";
import { Skladani } from "./views/Skladani.js";
import { SpravaAkce } from "./views/SpravaAkce.js";
import { VerejnyZapas } from "./views/VerejnyZapas.js";
import { ZkusebniLista } from "./views/ZkusebniLista.js";
/** Easter egg: klik na Robovo jméno v záhlaví přehraje crashout. */
import crashoutUrl from "./assets/crashout.mp3";
import zvonUrl from "./assets/zvon.mp3";
import logoUrl from "./assets/logo.webp";
import { prehraj } from "./zvuk.js";

/** Kanál, na který vede štít v záhlaví. */
const KANAL_BROHEMIANS = "https://www.youtube.com/@BrohemiansAoE";

/** Přepínač, který si prohlížeč pamatuje (debug mód, pohled uživatele). */
function useUlozenyPrepinac(klic: string, vychozi = false): [boolean, (v: boolean) => void] {
  const [hodnota, setHodnota] = useState(() => {
    try {
      const ulozeno = localStorage.getItem(klic);
      return ulozeno === null ? vychozi : ulozeno === "1";
    } catch {
      return vychozi;
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
  // Zkouška nového pozadí (lvi překreslení podle státního znaku): výchozí je
  // nové, přepínač pod pohledem uživatele ho vrací na původní, ať jde porovnat.
  const [novePozadi, setNovePozadi] = useUlozenyPrepinac("rezie.pozadi-nove", true);
  const [upravovany, setUpravovany] = useState<number | null>(null);
  // Ozubené kolečko vedle jména: hlasitost (jen tenhle prohlížeč) a pro admina lhůta aktivity.
  const [nastaveniVidet, setNastaveniVidet] = useState(false);
  const [hlasitostZvuku, setHlasitostZvuku] = useState(nactiHlasitost);
  useEffect(() => {
    document.documentElement.classList.toggle("pozadi-nove", novePozadi);
  }, [novePozadi]);
  const { stav, spojeno, obnov, novaVerze } = useAkceStav();

  const akce = stav?.akce ?? null;
  const admin = Boolean(me?.jeAdmin) && !pohledUzivatele;

  // Zvon z radnice (odvolání poplachu, „zpět do práce“) jako ve hře: hráčům
  // zazvoní, když host potvrdí založení jejich lobby — je čas se připojit;
  // adminovi, když se v některé lobby začne hrát — je čas na Spectate. První
  // snímek stavu po načtení stránky mlčí, jinak by zvonilo při každém
  // obnovení; hostovi nezvoní vlastní potvrzení.
  // Totéž zazvoní každému, komu v chatu zápasu přibyla zpráva od admina
  // (ne vlastní): admin v chatu je pokyn, ne řeč.
  // Zvonek od admina: když se u mé přihlášky změní čas svolání, zazvoní poplach
  // (Play_Townbell_Start). První snímek po načtení mlčí jako u ostatních zvuků.
  const predchoziSvolani = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!me) return;
    const moje = stav?.prihlaseni.find((h) => h.steamId === me.steamId)?.svolanV ?? null;
    const drive = predchoziSvolani.current;
    predchoziSvolani.current = moje;
    if (drive !== undefined && moje !== null && moje !== drive) prehraj(poplachUrl);
  }, [stav, me]);
  const predchoziLobby = useRef<Map<number, { lobbyId: string | null; faze: string | null; zprava: number }> | null>(null);
  useEffect(() => {
    const zapasy = stav?.zapasy ?? [];
    const drive = predchoziLobby.current;
    const posledniZprava = (z: ZapasView) => z.zpravy?.at(-1)?.id ?? 0;
    predchoziLobby.current = new Map(
      zapasy.map((z) => [z.id, { lobbyId: z.lobbyId, faze: z.fazeLobby ?? null, zprava: posledniZprava(z) }]),
    );
    if (!drive || !me) return;
    for (const z of zapasy) {
      const p = drive.get(z.id);
      if (!p) continue;
      const novaOdAdmina = (z.zpravy ?? []).some((m) => m.id > p.zprava && m.jeAdmin && m.steamId !== me.steamId);
      if (novaOdAdmina) {
        prehraj(zvonUrl);
        continue;
      }
      if (me.jeAdmin) {
        if (p.faze !== "hraje_se" && z.fazeLobby === "hraje_se") prehraj(zvonUrl);
        continue;
      }
      const ja = mujUcastnik(z, me.steamId);
      if (p.lobbyId === null && z.lobbyId !== null && ja && !ja.jeHost) prehraj(zvonUrl);
    }
  }, [stav, me]);

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

  // Panel přihlášených se při výběru hráče do sestavy o řádek zkrátí. Skok je
  // nepříjemný hlavně tím, že je okamžitý, tak se výška srovná plynule.
  const panelPrihlasenych = useRef<HTMLElement>(null);
  useZmenaVysky(panelPrihlasenych, String((admin ? skladani.nevybrani : (stav?.prihlaseni ?? [])).length));

  // Zápas se zakládá dole pod tabulkou přihlášených, takže z něj po kliknutí
  // nebyl vidět ani kus. Číslo si tu počká, než ho stav přinese, a karta se
  // pak najede doprostřed obrazovky.
  const [novyZapas, setNovyZapas] = useState<number | null>(null);
  useEffect(() => {
    if (novyZapas === null) return;
    const karta = document.querySelector(`[data-zapas="${novyZapas}"]`);
    // Stav se zápasem ještě nedorazil — efekt se pustí znovu, až dorazí.
    if (!karta) return;
    // V testovacím DOM scrollIntoView neexistuje; posun je ozdoba, ne funkce.
    karta.scrollIntoView?.({ behavior: "smooth", block: "center" });
    setNovyZapas(null);
  }, [novyZapas, stav]);

  // Puls aktivity: kliknutí nebo klávesa je zpráva „sedím u počítače“. Posílá
  // se nejvýš jednou za minutu; kolik z toho server uzná, řeší aktivita.ts.
  const akceId = akce?.id ?? null;
  useEffect(() => {
    if (akceId === null || !jsemPrihlaseny) return;
    let posledni = 0;
    const puls = () => {
      const ted = Date.now();
      if (ted - posledni < 60_000) return;
      posledni = ted;
      // Selhání se schválně polyká: puls je vedlejší, chybová hláška kvůli
      // němu by přebila to, co uživatel právě dělá.
      void api.aktivita(akceId).catch(() => {});
    };
    window.addEventListener("pointerdown", puls);
    window.addEventListener("keydown", puls);
    return () => {
      window.removeEventListener("pointerdown", puls);
      window.removeEventListener("keydown", puls);
    };
  }, [akceId, jsemPrihlaseny]);

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

  // Tytéž ovládací prvky obsluhují běžící zápasy i historii, proto se předává
  // jeden balík dvěma sekcím místo dvou opsaných seznamů.
  const rezieObsluha = {
    onStav: (zapasId: number, novyStav: string) => void hlidej(() => api.zapasStav(zapasId, novyStav)),
    onSmazat: (zapasId: number) => void hlidej(() => api.smazatZapas(zapasId)),
    onZavrit: (zapasId: number) => void hlidej(() => api.zavritZapas(zapasId)),
    onVysledek: (zapasId: number, vitez: Vitez) => void hlidej(() => api.vysledek(zapasId, vitez)),
    onHost: (zapasId: number, steamId: string) => void hlidej(() => api.zmenitHosta(zapasId, steamId)),
    onKontrolaLobby: (id: number) => api.kontrolaLobby(id),
    onZprava: (zapasId: number, text: string) => hlidej(() => api.zprava(zapasId, text)),
    onSmazatZpravu: (zapasId: number, zpravaId: number) => hlidej(() => api.smazatZpravu(zapasId, zpravaId)),
    onUpravit: (zapasId: number) => setUpravovany(zapasId),
    ladeni: admin && ladeni,
  };
  // Ozubené kolečko: který zápas je zrovna otevřený k úpravě. Zápas se bere
  // živý ze stavu, takže okno ukazuje, co právě platí, a zmizí se zápasem.
  const zapasKUprave = upravovany === null ? null : (stav?.zapasy.find((z) => z.id === upravovany) ?? null);

  return (
    <>
      {/* Nad <main>, ať jde přes celou šířku okna, ne jen obsahu. */}
      {novaVerze ? (
        <p className="nova-verze" role="status">
          Web se aktualizoval na verzi {novaVerze}, tahle stránka má {VERZE}.{" "}
          <button type="button" onClick={() => location.reload()}>
            Načíst znovu
          </button>
        </p>
      ) : null}
    <main>
      <header>
        {/* Štít vede na kanál Brohemians. Nová záložka schválně: rozehraný
            večer se nemá zavírat kvůli prokliku na YouTube. */}
        <a
          className="logo"
          href={KANAL_BROHEMIANS}
          target="_blank"
          rel="noreferrer noopener"
          title="Kanál Brohemians na YouTube"
        >
          <img src={logoUrl} alt="Brohemians" width={64} height={67} />
        </a>
        <h1>
          Komunitní hry —{" "}
          <button
            type="button"
            className="bez-vzhledu jmeno-roba"
            title="RobDiesALot"
            onClick={() => {
              prehraj(crashoutUrl);
            }}
          >
            RobDiesALot
          </button>
        </h1>
        <div className="hlavicka-vpravo">
          {me ? (
            <span>
              <button type="button" className="ozubene-kolecko" aria-label="Nastavení" title="Nastavení zvuků a večera" onClick={() => setNastaveniVidet(true)}>
                ⚙
              </button>{" "}
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
          {/* Zkušební pozadí: nové lvy proti původním, dokud se nerozhodne; jen v debug módu. */}
          {me?.jeAdmin && ladeni ? (
            <Prepinac popisek="Nové pozadí" vlevo="Původní lvi" vpravo="Nové lvy" zapnuto={novePozadi} onZmena={setNovePozadi} testId="prepinac-pozadi" />
          ) : null}
        </div>
      </header>

      {!spojeno ? <p className="spojeni">Obnovuji spojení…</p> : null}
      {chyba ? <p className="chyba">{chyba}</p> : null}

      {/* Kdo dorazil, se čte dřív, než se z toho staví zápas — tabulka proto
          stojí nad panelem akce, ne pod ním. */}
      {akce ? (
        <>
          {/* Název akce nad tabulkou přihlášených, stejně pro všechny: patří
              k celému večeru, ne k nastavení hry. Tužku má jen admin. */}
          {/* Ukončení akce stojí v řádce s názvem, ne v panelu: je to jediné
              tlačítko nad celým večerem, ne nad seznamem lidí, a mezi ostatními
              by se mu dalo omylem kliknout. */}
          <div className="radek-akce">
            <NazevAkce
              nazev={akce.nazev}
              onPrejmenovat={
                admin ? (novy) => void hlidej(() => api.prejmenovatAkci(akce.id, novy)) : undefined
              }
            />
            {admin && akce ? (
              <button
                onClick={() => {
                  // Nevratné: po „konec“ akce zmizí všem naráz ze streamu,
                  // včetně rozehraných zápasů. Proto potvrzení.
                  if (window.confirm(`Ukončit akci „${akce.nazev}“? Zpátky to nejde.`)) {
                    void hlidej(() => api.akceStav(akce.id, "konec"));
                  }
                }}
              >
                Ukončit akci
              </button>
            ) : null}
          </div>
          {/* Obal je jen kvůli vzhledu: nadpis a tabulka mají sedět na jedné
              desce s rámem, ne se vznášet na pozadí. Rozvržení nemění. */}
          <section className="panel-prihlaseni" ref={panelPrihlasenych}>
            {/* Tlačítka patří k tabulce, ne nad ni: přihlášení do akce i
                přetočení času jsou o tom, kdo je v seznamu. */}
            <header className="hlavicka-prihlasenych">
              <h3 className="nadpis-seznamu">Přihlášení hráči</h3>
              {/* Zleva doprava od nejméně vážného po nejvážnější: nástroj
                  na zkoušení, vlastní přihláška, konec celého večera. */}
              <div className="ovladani">
                {/* Debug mód na vývojové verzi. Zkušební hráči jdou první: napřed
                    se seznam naplní, teprve pak má smysl posouvat čas. */}
                {admin && ladeni && zkusebniHraci && akce ? (
                  <>
                    <button
                      onClick={() => void hlidej(() => api.pridatZkusebniho(akce.id))}
                      title="Přihlásí do akce dalšího zkušebního hráče"
                    >
                      + Zkušební hráč
                    </button>
                    <button
                      onClick={() => void hlidej(() => api.odebratZkusebni(akce.id))}
                      title="Odhlásí z akce všechny zkušební hráče"
                    >
                      Odebrat zkušební
                    </button>
                    {/* Popisek je slovy, na tlačítku je jen dvojšipka: „posunout
                        čas“ se řekne rychleji symbolem než větou. */}
                    <button
                      onClick={() => void hlidej(() => api.pretocitCas(akce.id, 15))}
                      aria-label="Posunout o 15 min"
                      title="Posune lhůty aktivity o čtvrt hodiny — všichni přihlášení usnou"
                    >
                      » 15 min
                    </button>
                    {/* Po minutách jde sledovat, jak odpočet ubývá a kdy se
                        nabídne „Jsem tu!“ — na to je uspání všech naráz hrubé. */}
                    <button
                      onClick={() => void hlidej(() => api.pretocitCas(akce.id, 1))}
                      aria-label="Posunout o 1 min"
                      title="Posune lhůty aktivity o minutu"
                    >
                      » 1 min
                    </button>
                  </>
                ) : null}
                {/* Existující akce sama o sobě znamená „hlásit se lze“ —
                    skončenou akci server do stavu vůbec neposílá. */}
                {me ? (
                  <button onClick={() => void prepnout()}>
                    {jsemPrihlaseny ? "Odhlásit se z akce" : "Přihlásit se do akce"}
                  </button>
                ) : null}
              </div>
            </header>
            <SeznamPrihlasenych
                ladeni={admin && ladeni}
              onSvolat={admin ? (steamId) => void hlidej(() => api.svolat(akce.id, steamId)) : undefined}
              lhutaMinut={akce.lhutaAktivityMinut}
              prihlaseni={stav?.prihlaseni ?? []}
              skladani={admin ? skladani : undefined}
              vZapase={vZapase}
              ja={me?.steamId ?? null}
              admin={admin}
              onJsemTu={() => void hlidej(() => api.jsemTu(akce.id))}
            />
          </section>
        </>
      ) : null}

      {/* Mimo větev `akce ?` níže schválně: bez tohohle by Rob neměl akci jak
          založit — dokud žádná neběží, celý panel režie se nevykresluje. */}
      {admin ? (
        <SpravaAkce
          akce={akce}
          onZalozit={(nazev) => void hlidej(() => api.vytvoritAkce(nazev))}
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
          onNoveHeslo={() => {
            if (!akce) return;
            void hlidej(async () => {
              await api.pristiHeslo(akce.id);
              pridejToast("Nové heslo vygenerováno");
            });
          }}
        >
          {akce ? (
            <Skladani
              skladani={skladani}
              onVytvoritZapas={(sestava) =>
                void hlidej(async () => {
                  const { zapas } = await api.vytvoritZapas(akce.id, sestava);
                  setNovyZapas(zapas.id);
                })
              }
              sadaCivilizaci={doplnNastaveni(akce.nastaveniLobby as Partial<NastaveniLobby>).sadaCivilizaci}
              zvyraznit={zvyrazneni?.druh === "skladani" ? zvyrazneni : null}
              onPrvniAi={() => {
                // Bez AI v lobby na obtížnosti nezáleží a „–“ je v pořádku.
                // S prvním počítačem už ne — políčko blikne, ať to admina
                // trkne dřív, než lobby založí. Nastavit ho musí sám: který
                // stupeň chce, web neuhodne.
                if (doplnNastaveni(akce.nastaveniLobby as Partial<NastaveniLobby>).aiObtiznost === null) {
                  zvyrazni("nastaveni", "aiObtiznost");
                }
              }}
            />
          ) : null}
        </SpravaAkce>
      ) : null}

      {akce ? (
        <>
          {admin && stav ? <Rezie stav={stav} obsluha={rezieObsluha} ja={me?.steamId} /> : null}
          {admin && stav && zapasKUprave ? (
            <EditaceZapasu
              zapas={zapasKUprave}
              prihlaseni={stav.prihlaseni}
              onNastaveni={(n) => hlidej(() => api.nastaveniZapasu(zapasKUprave.id, n))}
              onNazev={(nazev) => hlidej(() => api.nazevLobbyZapasu(zapasKUprave.id, nazev))}
              onSestava={(sestava) => hlidej(() => api.sestavaZapasu(zapasKUprave.id, sestava))}
              onZavrit={() => setUpravovany(null)}
            />
          ) : null}
          {me
            ? mojeZapasy(stav?.zapasy ?? [], me.steamId).map((zapas) =>
                mujUcastnik(zapas, me.steamId)?.jeHost ? (
                  <ObrazovkaHosta
                    key={zapas.id}
                    zapas={zapas}
                    ja={me.steamId}
                    nastaveniLobby={zapas.nastaveni && Object.keys(zapas.nastaveni).length > 0 ? zapas.nastaveni : akce.nastaveniLobby}
                    onHledatLobby={(id) => api.hledatLobby(id)}
                    onKontrolaLobby={(id) => api.kontrolaLobby(id)}
                    chat={<Chat zapas={zapas} ja={me.steamId} onOdeslat={(text) => hlidej(() => api.zprava(zapas.id, text))} ladeni={admin && ladeni} />}
                  />
                ) : (
                  <KartaHrace
                    key={zapas.id}
                    zapas={zapas}
                    ja={me.steamId}
                    onPripojit={(id) => void hlidej(() => api.pripojeni(id))}
                    onHledatLobby={(id) => api.hledatLobby(id)}
                    chat={<Chat zapas={zapas} ja={me.steamId} onOdeslat={(text) => hlidej(() => api.zprava(zapas.id, text))} ladeni={admin && ladeni} />}
                  />
                ),
              )
            : null}
          {/* Zápas, na který divák nemá vlastní kartu. Anonyma i nehrajícího
              diváka do 5. 9. 2026 shodily dva filtry naráz (`me ?` a
              mojeZapasy()), takže složený zápas neviděl nikdo kromě hráčů
              a admina — přestože ho server posílá všem a jen zaslepí
              tajemství. */}
          {/* Zkrácený řádek zůstal jen pro zápasy, které se hrají a divák u nich
              nemá vlastní kartu. Dohrané mají plnou kartu v historii níž, tak
              by tu říkal totéž podruhé. Adminovi nezbývá nic: běžící zápasy má
              v režii. */}
          {admin
            ? null
            : verejneZapasy(stav?.zapasy ?? [], me?.steamId ?? null)
                .filter(jeVeHre)
                .map((zapas) => <VerejnyZapas key={zapas.id} zapas={zapas} ja={me?.steamId ?? null} />)}
          {/* Historie až pod aktivní zápas a pod vlastní kartu: rozehraný zápas
              má zůstat nahoře, dohrané jsou k nahlédnutí. Hráči vidí tytéž
              karty jako Rob, jen bez obsluhy — číst, ne zasahovat. */}
          {stav ? <HistorieZapasu stav={stav} obsluha={admin ? rezieObsluha : undefined} /> : null}
        </>
      ) : (
        <p className="prazdno">Právě neběží žádná akce.</p>
      )}

      {nastaveniVidet ? (
        <NastaveniUzivatele
          hlasitost={hlasitostZvuku}
          onHlasitost={setHlasitostZvuku}
          lhutaMinut={admin && akce ? (akce.lhutaAktivityMinut ?? 15) : undefined}
          onLhuta={admin && akce ? (minut) => void hlidej(() => api.lhutaAktivity(akce.id, minut)) : undefined}
          onZavrit={() => setNastaveniVidet(false)}
        />
      ) : null}
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
    </>
  );
}
