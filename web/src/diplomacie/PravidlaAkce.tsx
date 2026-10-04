import type { DiploData } from "../../../src/shared/diplomacie/typy.js";
import { MapaScenare, popiskyStartu } from "./MapaScenare.js";
import { ObsahPravidel } from "./PravidlaHry.js";

/**
 * Odkaz na pravidla jako dokument pro diváky; null = zatím žádný. Musí to
 * být kopie jen ke čtení (uživatel 4. 10. 2026: „nový dokument, který nemůže
 * kdokoli měnit“).
 */
const ODKAZ_PRAVIDEL: string | null = null;

/**
 * Pravidla hry na stránce akce pro každého, i bez zápasu a bez přihlášení
 * (uživatel 4. 10. 2026): nahoře velká mapa aktivní verze scénáře, pod ní
 * kartičky po třech na řádek. Jen obecná pravidla — nic o rolích hráčů.
 */
export function PravidlaAkce({ data }: { data: DiploData }) {
  const verze = data.aktivni;
  return (
    <section className="sekce-krok pravidla-akce" data-testid="pravidla-akce">
      <header className="zahlavi-sekce">
        <h3>Pravidla hry</h3>
      </header>
      {verze?.rozbor ? <MapaScenare verze={verze} popisky={popiskyStartu(verze)} velikost="velka" /> : null}
      {ODKAZ_PRAVIDEL ? (
        <p className="stred">
          <a href={ODKAZ_PRAVIDEL} target="_blank" rel="noreferrer">
            Celá pravidla v dokumentu
          </a>
        </p>
      ) : null}
      <div className="pravidla-hry">
        <ObsahPravidel verze={verze} />
      </div>
    </section>
  );
}
