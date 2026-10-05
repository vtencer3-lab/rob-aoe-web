import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { donactiDoplnkoveObrazky } from "./mapyNahledy.js";
import { sledujZaviraniOken } from "./pohyb.js";
import { pravniStrankaZCesty } from "./pravniCesty.js";
import { vstupniStranka } from "./vstupniStranka.js";
import "./styl.css";

// Zavíraná okna dojedou animací, i když je React z DOM odebral (pohyb.ts).
sledujZaviraniOken();

createRoot(document.getElementById("root")!).render(
  <StrictMode>{vstupniStranka(window.location.pathname)}</StrictMode>,
);

// Náhledy map a další doplňkové obrázky patří jen hlavní aplikaci — právní
// stránky (podmínky, soukromí) žádné nemají a nemají proč tahat cokoliv
// navíc mimo sebe sama.
if (!pravniStrankaZCesty(window.location.pathname)) {
  donactiDoplnkoveObrazky();
}
