import { useEffect, useState } from "react";
import { api, type Me } from "./api.js";
import { useAkceStav } from "./useAkceStav.js";
import { SeznamPrihlasenych } from "./views/SeznamPrihlasenych.js";

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

  return (
    <main>
      <header>
        <h1>Komunitní hry — Robdiesalot</h1>
        {me ? (
          <span>
            {me.alias ?? me.steamId}{" "}
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

      {akce ? (
        <>
          <h2>{akce.nazev}</h2>
          {me && akce.stav === "prihlasovani" ? (
            <button onClick={() => void prepnout()}>
              {jsemPrihlaseny ? "Odhlásit se z akce" : "Přihlásit se do akce"}
            </button>
          ) : null}
          <SeznamPrihlasenych prihlaseni={stav?.prihlaseni ?? []} />
        </>
      ) : (
        <p className="prazdno">Právě neběží žádná akce.</p>
      )}
    </main>
  );
}
