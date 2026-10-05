import { useState } from "react";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { Kopirovatelne } from "../views/Kopirovatelne.js";
import { diploApi } from "./api.js";

/**
 * Složka scénářů hry pro tohoto hráče (ověřeno na stroji autora 1. 10. 2026,
 * spec §5.3). Hra ji jmenuje podle účtu: Steam ID, nebo XUID — bez předpony
 * `xbox:`, ta je jen webové id hráče.
 */
export function cestaKeScenarum(hracId: string): string {
  const id = hracId.startsWith("xbox:") ? hracId.slice("xbox:".length) : hracId;
  return `%USERPROFILE%\\Games\\Age of Empires 2 DE\\${id}\\resources\\_common\\scenario\\`;
}

/**
 * Stažení scénáře pro hosta v kroku „Zakládáš!“ (spec §5.3): verze, kterou
 * zápas hraje, a cesta přímo pro něj ke zkopírování. Co s tím ve hře, slovy
 * neříká — hned pod tím je okno Create Lobby s Game Mode Custom Scenario,
 * věta by ho jen opakovala (uživatel 2. 10. 2026). Ostatní hráči scénář
 * dostanou přenosem v lobby, tak tohle vidí jen host.
 *
 * Pořadí (uživatel 3. 10. 2026): nahoře „Stáhnout scénář“, po kliknutí
 * „Ulož scénář do:“ s cestou ke zkopírování, a až pod tím (v jádře)
 * „Spustit hru“. Ukládání rovnou do složky přes File System Access API
 * (2. 10. 2026) uživatel 3. 10. zrušil jako neintuitivní: dialog se
 * otevíral v Dokumentech a předvolit cestu prohlížeč nedovolí.
 */
export function StazeniScenare({ verze, ja }: { verze: ScenarVerze | null; ja: string }) {
  const [stazeno, setStazeno] = useState(false);
  if (!verze) return <p className="ceka stred">Scénář zatím nikdo nenahrál.</p>;
  return (
    <div className="stazeni-scenare">
      <a className="cta" href={diploApi.souborUrl(verze.id)} download={verze.jmenoHry} onClick={() => setStazeno(true)}>
        Stáhnout scénář
      </a>
      {stazeno ? (
        <>
          <p>Ulož scénář do:</p>
          <Kopirovatelne hodnota={cestaKeScenarum(ja)} popis="cestu ke scénářům" />
        </>
      ) : null}
    </div>
  );
}
