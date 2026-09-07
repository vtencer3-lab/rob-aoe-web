import { useEffect, useState } from "react";
import { api, type Me } from "./api.js";
import { cesta } from "./cesty.js";
import { VERZE } from "../../src/shared/verze.js";
import { useAkceStav } from "./useAkceStav.js";
import { useSkladani } from "./skladani.js";
import { jmenoHrace, mojeZapasy, mujUcastnik, verejneZapasy } from "./zapas.js";
import { KartaHrace } from "./views/KartaHrace.js";
import { ObrazovkaHosta } from "./views/ObrazovkaHosta.js";
import { Rezie } from "./views/Rezie.js";
import { SeznamPrihlasenych } from "./views/SeznamPrihlasenych.js";
import { SpravaAkce } from "./views/SpravaAkce.js";
import { VerejnyZapas } from "./views/VerejnyZapas.js";
import { ZkusebniLista } from "./views/ZkusebniLista.js";

export function App() {
  const [me, setMe] = useState<Me["hrac"]>(null);
  const [zkusebniHraci, setZkusebniHraci] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const { stav, spojeno } = useAkceStav();
  // Sestava se skládá ze dvou míst: tabulka přihlášených (nevybraní, „+“)
  // a panel režie (vybraní). Stav proto žije tady, nad oběma.
  const skladani = useSkladani(stav?.prihlaseni ?? []);

  useEffect(() => {
    void api.me().then((odpoved) => setMe(odpoved.hrac));
    void api
      .nastaveni()
      .then((n) => setZkusebniHraci(n.zkusebniHraci))
      .catch(() => {});
  }, []);

  const akce = stav?.akce ?? null;
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
      </header>

      {!spojeno ? <p className="spojeni">Obnovuji spojení…</p> : null}
      {chyba ? <p className="chyba">{chyba}</p> : null}

      {/* Mimo větev `akce ?` níže schválně: bez tohohle by Rob neměl akci jak
          založit — dokud žádná neběží, celý panel režie se nevykresluje. */}
      {me?.jeAdmin ? (
        <SpravaAkce
          akce={akce}
          onZalozit={(nazev) => void hlidej(() => api.vytvoritAkce(nazev))}
          onStav={(novyStav) => {
            if (akce) void hlidej(() => api.akceStav(akce.id, novyStav));
          }}
          onNastaveniLobby={(n) => {
            if (akce) void hlidej(() => api.nastaveniLobby(akce.id, n));
          }}
          zkusebni={
            zkusebniHraci && akce
              ? {
                  onPridat: () => void hlidej(() => api.pridatZkusebniho(akce.id)),
                  onOdebrat: () => void hlidej(() => api.odebratZkusebni(akce.id)),
                }
              : undefined
          }
        />
      ) : null}

      {akce ? (
        <>
          <h2>{akce.nazev}</h2>
          {/* Existující akce sama o sobě znamená „hlásit se lze“ — skončenou
              akci server do stavu vůbec neposílá. */}
          {me ? (
            <button onClick={() => void prepnout()}>
              {jsemPrihlaseny ? "Odhlásit se z akce" : "Přihlásit se do akce"}
            </button>
          ) : null}
          <SeznamPrihlasenych prihlaseni={stav?.prihlaseni ?? []} skladani={me?.jeAdmin ? skladani : undefined} />
          {me?.jeAdmin && stav ? (
            <Rezie
              stav={stav}
              skladani={skladani}
              onVytvoritZapas={(sestava) => void hlidej(() => api.vytvoritZapas(akce.id, sestava))}
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
          prohlížeč drží nový build, nebo starý z mezipaměti. */}
      <footer className="verze" data-testid="verze">
        v{VERZE}
      </footer>
    </main>
  );
}
