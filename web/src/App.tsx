import { useEffect, useState } from "react";
import { api, type Me } from "./api.js";
import { cesta } from "./cesty.js";
import { doplnNastaveni, type NastaveniLobby } from "../../src/shared/lobbyKontrola.js";
import { VERZE } from "../../src/shared/verze.js";
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
  const { stav, spojeno } = useAkceStav();

  const akce = stav?.akce ?? null;
  const admin = Boolean(me?.jeAdmin) && !pohledUzivatele;
  // Kdo je v běžícím zápase — v tabulce přihlášených dostane zkřížené meče.
  const vZapase = new Map<string, number>();
  for (const z of stav?.zapasy ?? []) {
    if (z.stav === "bezi") for (const u of z.ucastnici) vZapase.set(u.steamId, z.poradi);
  }

  // Rozpracovaná sestava žije u akce na serveru a přes SSE ji vidí všichni
  // admini; tady se jen ukazuje a každé kliknutí odchází zpátky.
  const skladani = useSkladani(
    stav?.prihlaseni ?? [],
    akce ? { hodnota: akce.skladani ?? [], odesli: (sestava) => api.skladani(akce.id, sestava) } : undefined,
  );

  useEffect(() => {
    void api.me().then((odpoved) => setMe(odpoved.hrac));
    void api
      .nastaveni()
      .then((n) => setZkusebniHraci(n.zkusebniHraci))
      .catch(() => {});
  }, []);

  const jsemPrihlaseny = Boolean(me && stav?.prihlaseni.some((h) => h.steamId === me.steamId));

  async function prepnout() {
    if (!akce || !me) return;
    try {
      setChyba(null);
      await (jsemPrihlaseny ? api.odhlasit(akce.id) : api.prihlasit(akce.id));
    } catch (err) {
      setChyba(err instanceof Error ? err.message : "Nepovedlo se to.");
    }
  }

  async function hlidej(akce: () => Promise<unknown>) {
    try {
      setChyba(null);
      await akce();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : "Nepovedlo se to.");
    }
  }

  return (
    <main>
      <header>
        <h1>Komunitní hry — RobDiesALot</h1>
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
            if (akce) void hlidej(() => api.nastaveniLobby(akce.id, n));
          }}
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
