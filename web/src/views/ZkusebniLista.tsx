import { useEffect, useState } from "react";
import { cesta } from "../cesty.js";

interface DevInfo {
  hraci: string[];
  reziser: { jmeno: string; steamId: string };
  skutecni: { steamId: string; alias: string | null }[];
  admin: string | null;
}

/**
 * Lišta pro zkoušku večera nasucho. Vykreslí se jen tam, kde server zkušební
 * dveře opravdu otevřel — na veřejné adrese vrací /api/dev/hraci 404 a lišta
 * tím zmizí, aniž by o produkčním režimu musel frontend cokoliv vědět.
 *
 * Odkazy, ne fetch: všechny tyhle routy odpovídají přesměrováním na kořen,
 * takže obyčejný proklik udělá přesně to, co má, včetně nastavení cookie.
 */
export function ZkusebniLista({ jaSteamId }: { jaSteamId: string | null }) {
  const [info, setInfo] = useState<DevInfo | null>(null);

  useEffect(() => {
    let zruseno = false;
    void (async () => {
      try {
        const odpoved = await fetch(cesta("/api/dev/hraci"));
        if (!odpoved.ok || zruseno) return;
        setInfo((await odpoved.json()) as DevInfo);
      } catch {
        // Zkušební dveře prostě nejsou. Stránka se tím nesmí rozbít.
      }
    })();
    return () => {
      zruseno = true;
    };
  }, []);

  if (!info) return null;

  const kdoMaRezii =
    info.admin === null
      ? "nikdo"
      : (info.skutecni.find((u) => u.steamId === info.admin)?.alias ?? info.admin);

  return (
    <section className="zkusebni">
      <p className="zaloha">
        Zkušební režim: přihlášení bez Steamu. Přes veřejnou adresu se tyhle dveře samy zavřou.
      </p>

      <div className="ovladani">
        <a className="tlacitko" href={cesta("/api/dev/naplnit?pocet=3")}>
          Nasypat 3 hráče do akce
        </a>
        {info.hraci.map((jmeno) => (
          <a key={jmeno} href={cesta(`/api/dev/login?jmeno=${encodeURIComponent(jmeno)}`)}>
            Jsem {jmeno}
          </a>
        ))}
        <a href={cesta(`/api/dev/login?jmeno=${encodeURIComponent(info.reziser.jmeno)}`)}>
          Jsem {info.reziser.jmeno}
        </a>
        {info.skutecni
          .filter((u) => u.steamId !== jaSteamId)
          .map((u) => (
            <a key={u.steamId} href={cesta(`/api/dev/login?steamId=${encodeURIComponent(u.steamId)}`)}>
              Jsem {u.alias ?? u.steamId}
            </a>
          ))}
      </div>

      {/* Bez přenosu režie si vlastním účtem nejde vyzkoušet pohled hráče:
          admin je natrvalo ten, kdo se přihlásil první, a panel režie mu
          svítí i uprostřed zápasu, který zrovna hraje. */}
      <p className="zaloha">Režii má: {kdoMaRezii}</p>
      <div className="ovladani">
        <a href={cesta(`/api/dev/rezie?steamId=${encodeURIComponent(info.reziser.steamId)}`)}>
          Režii dej účtu {info.reziser.jmeno}
        </a>
        <a href={cesta("/api/dev/rezie")}>Režii dej tomuhle účtu</a>
      </div>
    </section>
  );
}
