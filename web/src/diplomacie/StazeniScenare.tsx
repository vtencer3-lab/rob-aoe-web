import { useEffect, useState } from "react";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { Kopirovatelne } from "../views/Kopirovatelne.js";
import { diploApi } from "./api.js";
import { nactiSlozku, SLOZKA_SCENARU, ulozDoHry, umiSlozkuHry, type VolbyUlozeni } from "./slozkaHry.js";

/**
 * Složka scénářů hry pro tohoto hráče (ověřeno na stroji autora 1. 10. 2026,
 * spec §5.3). Hra ji jmenuje podle účtu: Steam ID, nebo XUID — bez předpony
 * `xbox:`, ta je jen webové id hráče.
 */
export function cestaKeScenarum(hracId: string): string {
  const id = hracId.startsWith("xbox:") ? hracId.slice("xbox:".length) : hracId;
  return `%USERPROFILE%\\Games\\Age of Empires 2 DE\\${id}\\resources\\_common\\${SLOZKA_SCENARU}\\`;
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
 * „Spustit hru“. Kde prohlížeč umí zapisovat do složky (Chrome, Edge),
 * zůstává „Uložit scénář do hry“ jako vedlejší možnost.
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
      {umiSlozkuHry() ? <UlozeniDoHry verze={verze} ja={ja} /> : null}
    </div>
  );
}

type Hlaska = { druh: "vyzva" } | { druh: "ulozeno"; slozka: string } | { druh: "chyba"; text: string } | { druh: "cizi"; slozka: FileSystemDirectoryHandle };

/**
 * „Uložit scénář do hry“: tlačítko, hlášky a pojistka nad `ulozDoHry`
 * (slozkaHry.ts) — veškerá práce se složkou, povolením a zápisem je tam.
 * Tady se jen drží, co hráči ukázat.
 */
function UlozeniDoHry({ verze, ja }: { verze: ScenarVerze; ja: string }) {
  // Jméno zapamatované složky; `null`, dokud hráč žádnou nevybral.
  const [slozka, setSlozka] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const [hlaska, setHlaska] = useState<Hlaska | null>(null);
  useEffect(() => {
    let zije = true;
    void nactiSlozku(ja).then((s) => {
      if (zije) setSlozka(s?.name ?? null);
    });
    return () => {
      zije = false;
    };
  }, [ja]);

  const uloz = (volby: VolbyUlozeni = {}) => {
    if (!volby.potvrzena && (volby.vybratZnovu || slozka === null)) {
      // Přijde dialog výběru složky. Předvolit v něm cestu prohlížeč nedovolí,
      // tak ji hráč dostane aspoň do schránky a v dialogu ji jen vloží.
      // Schránka je jen na https; když odmítne, cesta je pořád na řádku níž.
      void navigator.clipboard?.writeText(cestaKeScenarum(ja)).catch(() => {});
      setHlaska({ druh: "vyzva" });
    } else setHlaska(null);
    setPracuje(true);
    void ulozDoHry(ja, { url: diploApi.souborUrl(verze.id), jmeno: verze.jmenoHry }, volby)
      .then(async (v) => {
        if (v.stav === "ulozeno") {
          setSlozka(v.slozka);
          setHlaska({ druh: "ulozeno", slozka: v.slozka });
        } else if (v.stav === "cizi-slozka") setHlaska({ druh: "cizi", slozka: v.slozka });
        else if (v.stav === "nevybrano") setHlaska({ druh: "chyba", text: "Složka nebyla vybrána. Zkus to znovu, nebo scénář stáhni obyčejně odkazem níž." });
        else {
          setHlaska({ druh: "chyba", text: v.text });
          // Zmizelou složku modul zapomněl — ať řádek „Ukládá se do…“ neukazuje, co neplatí.
          setSlozka((await nactiSlozku(ja))?.name ?? null);
        }
      })
      .finally(() => setPracuje(false));
  };

  return (
    <>
      <button type="button" disabled={pracuje} onClick={() => uloz()}>
        {pracuje ? "Ukládám…" : "Uložit scénář do hry"}
      </button>
      {hlaska?.druh === "vyzva" ? (
        <p className="vyzva" role="status">
          Vyber složku scénářů hry — cestu máš ve schránce, v dialogu ji vlož.
        </p>
      ) : null}
      {hlaska?.druh === "ulozeno" ? (
        <p className="potvrzeno" role="status">
          Uloženo do složky <strong>{hlaska.slozka}</strong>.
        </p>
      ) : null}
      {hlaska?.druh === "chyba" ? (
        <p className="chyba" role="alert">
          {hlaska.text}
        </p>
      ) : null}
      {hlaska?.druh === "cizi" ? (
        <div className="pojistka" role="alert">
          <p>
            Tohle nevypadá jako složka scénářů hry — čekám …\resources\_common\{SLOZKA_SCENARU}. Vybraná složka se jmenuje <strong>{hlaska.slozka.name}</strong>.
          </p>
          <div className="ovladani">
            <button type="button" disabled={pracuje} onClick={() => uloz({ potvrzena: hlaska.slozka })}>
              Uložit sem
            </button>
            <button type="button" disabled={pracuje} onClick={() => uloz({ vybratZnovu: true })}>
              Vybrat znovu
            </button>
          </div>
        </div>
      ) : null}
      {slozka !== null && hlaska?.druh !== "cizi" ? (
        <p className="slozka">
          Ukládá se do složky <strong>{slozka}</strong> ·{" "}
          <button type="button" className="bez-vzhledu zmenit-slozku" disabled={pracuje} onClick={() => uloz({ vybratZnovu: true })}>
            změnit složku
          </button>
        </p>
      ) : null}
    </>
  );
}
