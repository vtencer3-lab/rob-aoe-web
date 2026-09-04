import { useEffect, useState } from "react";
import { api, type Me } from "./api.js";
import { useAkceStav } from "./useAkceStav.js";
import { jmenoHrace, mojeZapasy, mujUcastnik } from "./zapas.js";
import { KartaHrace } from "./views/KartaHrace.js";
import { ObrazovkaHosta } from "./views/ObrazovkaHosta.js";
import { Rezie } from "./views/Rezie.js";
import { SeznamPrihlasenych } from "./views/SeznamPrihlasenych.js";
import { SpravaAkce } from "./views/SpravaAkce.js";
import { ZkusebniLista } from "./views/ZkusebniLista.js";

export function App() {
  const [me, setMe] = useState<Me["hrac"]>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const { stav, spojeno } = useAkceStav();

  useEffect(() => {
    void api.me().then((odpoved) => setMe(odpoved.hrac));
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
        <h1>Komunitní hry — Robdiesalot</h1>
        {me ? (
          <span>
            {jmenoHrace(me)}{" "}
            <button onClick={() => void api.odhlasitSe().then(() => setMe(null))}>Odhlásit</button>
          </span>
        ) : (
          <a className="tlacitko" href="/api/auth/steam">
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
        />
      ) : null}

      {akce ? (
        <>
          <h2>{akce.nazev}</h2>
          {me && akce.stav === "prihlasovani" ? (
            <button onClick={() => void prepnout()}>
              {jsemPrihlaseny ? "Odhlásit se z akce" : "Přihlásit se do akce"}
            </button>
          ) : null}
          <SeznamPrihlasenych prihlaseni={stav?.prihlaseni ?? []} />
          {me?.jeAdmin && stav ? (
            <Rezie
              stav={stav}
              onVytvoritZapas={(format, steamIds) =>
                void hlidej(() => api.vytvoritZapas(akce.id, format, steamIds))
              }
              onStav={(zapasId, novyStav) => void hlidej(() => api.zapasStav(zapasId, novyStav))}
              onVysledek={(zapasId, viteznyTym) => void hlidej(() => api.vysledek(zapasId, viteznyTym))}
              onHost={(zapasId, steamId) => void hlidej(() => api.zmenitHosta(zapasId, steamId))}
            />
          ) : null}
          {me
            ? mojeZapasy(stav?.zapasy ?? [], me.steamId).map((zapas) =>
                mujUcastnik(zapas, me.steamId)?.jeHost ? (
                  <ObrazovkaHosta
                    key={zapas.id}
                    zapas={zapas}
                    ja={me.steamId}
                    onVlozitOdkaz={(id, odkaz) => void hlidej(() => api.vlozitOdkaz(id, odkaz))}
                    onPotvrdit={(id) => void hlidej(() => api.potvrdit(id))}
                  />
                ) : (
                  <KartaHrace
                    key={zapas.id}
                    zapas={zapas}
                    ja={me.steamId}
                    onPripojit={(id) => void hlidej(() => api.pripojeni(id))}
                  />
                ),
              )
            : null}
        </>
      ) : (
        <p className="prazdno">Právě neběží žádná akce.</p>
      )}

      <ZkusebniLista jaSteamId={me?.steamId ?? null} />
    </main>
  );
}
