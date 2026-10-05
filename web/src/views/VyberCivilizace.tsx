import { CIVILIZACE, nazevCivilizace, patriDoSady } from "../../../src/shared/civilizace.js";
import { erbCivilizace } from "../civErby.js";
import { Rozbalovaci } from "./Rozbalovaci.js";

interface Props {
  hodnota: number | null;
  onZmena: (civ: number | null) => void;
  /** Popisek pro čtečky, např. „Civilizace Trokner“. */
  popisek: string;
  /** Civilization Set z nastavení akce; null = je to jedno, nabídne se všechno. */
  sada: number | null;
  /** Jen ke čtení (karta hráče): zašedlé tlačítko, seznam se neotvírá. */
  vypnuto?: boolean;
}

const PODLE_JMENA: number[] = Object.entries(CIVILIZACE)
  .map(([id, nazev]) => ({ id: Number(id), nazev }))
  .sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"))
  .map((c) => c.id);

/**
 * Nabídka podle zvolené sady. Vybraná civilizace v seznamu zůstává, i když do
 * sady nepatří — Rob mohl sadu přepnout až po ní a mlčky ji vyhodit by
 * znamenalo, že se z rozbaleného seznamu nedá poznat, co je nastavené.
 */
function nabidka(sada: number | null, hodnota: number | null): Array<number | null> {
  return [null, ...PODLE_JMENA.filter((civ) => patriDoSady(civ, sada) || civ === hodnota)];
}

export function Erb({ civ, velikost = 48 }: { civ: number | null; velikost?: number }) {
  const url = erbCivilizace(civ);
  if (!url) return null;
  return <img className="erb" src={url} alt="" height={velikost} loading="lazy" />;
}

/**
 * Výběr civilizace s erbem před jménem, jako ve hře. Nativní <select> obrázky
 * neumí — tlačítko a seznam dělá společný `Rozbalovaci`.
 */
export function VyberCivilizace({ hodnota, onZmena, popisek, sada, vypnuto = false }: Props) {
  return (
    <Rozbalovaci
      trida="vyber-civ"
      polozky={nabidka(sada, hodnota)}
      hodnota={hodnota}
      onZmena={onZmena}
      popisek={popisek}
      vypnuto={vypnuto}
      klic={(civ) => civ ?? "libovolna"}
      obsah={(civ) => (
        <>
          <Erb civ={civ} />
          <span>{civ === null ? "libovolná civ." : nazevCivilizace(civ)}</span>
        </>
      )}
    />
  );
}
