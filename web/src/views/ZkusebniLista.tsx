import { useEffect, useState } from "react";

interface DevInfo {
  hraci: string[];
  admin: string | null;
}

/**
 * Lišta pro zkoušku večera nasucho. Vykreslí se jen tam, kde server zkušební
 * dveře opravdu otevřel — na veřejné adrese vrací /api/dev/hraci 404 a lišta
 * tím zmizí, aniž by o produkčním režimu musel frontend cokoliv vědět.
 *
 * Odkazy, ne fetch: obě routy odpovídají přesměrováním na kořen, takže
 * obyčejný proklik udělá přesně to, co má, včetně nastavení cookie.
 */
export function ZkusebniLista({ jaSteamId }: { jaSteamId: string | null }) {
  const [info, setInfo] = useState<DevInfo | null>(null);

  useEffect(() => {
    let zruseno = false;
    void (async () => {
      try {
        const odpoved = await fetch("/api/dev/hraci");
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

  return (
    <section className="zkusebni">
      <p className="zaloha">
        Zkušební režim: přihlášení bez Steamu. Přes veřejnou adresu se tyhle dveře samy zavřou.
      </p>
      <div className="ovladani">
        <a className="tlacitko" href="/api/dev/naplnit?pocet=3">
          Nasypat 3 hráče do akce
        </a>
        {info.hraci.map((jmeno) => (
          <a key={jmeno} href={`/api/dev/login?jmeno=${encodeURIComponent(jmeno)}`}>
            Jsem {jmeno}
          </a>
        ))}
        {info.admin && info.admin !== jaSteamId ? (
          <a href={`/api/dev/login?steamId=${encodeURIComponent(info.admin)}`}>Zpět na svůj účet</a>
        ) : null}
      </div>
    </section>
  );
}
