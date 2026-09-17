import type { ReactElement } from "react";
import { App } from "./App.js";
import { pravniStrankaZCesty } from "./pravniCesty.js";
import { Podminky } from "./views/Podminky.js";
import { Soukromi } from "./views/Soukromi.js";

/**
 * Co se má vykreslit do `#root` podle adresy v prohlížeči. Oddělené od
 * main.tsx schválně: main.tsx má vedlejší účinek (mountne do DOM) hned při
 * importu, takže se nedá jednoduše otestovat. Tahle funkce je čistá — jde jí
 * ověřit testem, že přímé načtení `/podminky` nebo `/soukromi` fakt vede na
 * tu stránku, ne na hlavní aplikaci ani na nic prázdného.
 */
export function vstupniStranka(pathname: string): ReactElement {
  const stranka = pravniStrankaZCesty(pathname);
  if (stranka === "podminky") return <Podminky />;
  if (stranka === "soukromi") return <Soukromi />;
  return <App />;
}
