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
 * zápas hraje, cesta přímo pro něj ke zkopírování a co s tím ve hře. Ostatní
 * hráči scénář dostanou přenosem v lobby, tak tohle vidí jen host.
 */
export function StazeniScenare({ verze, ja }: { verze: ScenarVerze | null; ja: string }) {
  if (!verze) return <p className="ceka stred">Scénář zatím nikdo nenahrál.</p>;
  return (
    <div className="stazeni-scenare">
      <a className="cta" href={diploApi.souborUrl(verze.id)} download={verze.jmenoSouboru}>
        Stáhnout scénář
      </a>
      <p>
        Ulož <strong>{verze.jmenoSouboru}</strong> do složky (starou kopii stejného jména přepiš):
      </p>
      <Kopirovatelne hodnota={cestaKeScenarum(ja)} popis="cestu ke scénářům" />
      <p>
        V Create Lobby zvol Game Mode <strong>Scenario</strong> a tenhle scénář. Ostatní hráči ho dostanou z lobby.
      </p>
    </div>
  );
}
