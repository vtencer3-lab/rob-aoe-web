import { POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { VERZE as verze } from "./fixtury.js";
import { PravidlaHry } from "./PravidlaHry.js";

/** Položka seznamu podle celého textu — ikonky rolí (TextSIkonami) větu dělí do víc prvků. */
const polozky = (t: string | RegExp) => screen.queryAllByText((_, el) => el?.tagName === "LI" && (typeof t === "string" ? el.textContent === t : t.test(el.textContent ?? "")));

it("pravidla vypíšou cíle s čísly ze scénáře a limity", () => {
  render(<PravidlaHry verze={verze} />);
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.getByText(/Zabij 650 nepratelskych jednotek/)).toBeTruthy();
  expect(screen.getByText(/Nejvýš 30 vesničanů/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Nástupce císaře" })).toBeTruthy();
  expect(screen.getByText(/Vlastní podmínky scénáře/)).toBeTruthy();
});

// Sbalený tahák nemá tělo v DOM: karta role vedle něj je jediné místo, kde
// jméno role hráče je. Bez rozboru (žádná verze) zůstanou jen texty rolí.
it("sbalený tahák nic nevypisuje; bez rozboru jen role a primární cíle", () => {
  render(<PravidlaHry verze={null} />);
  expect(screen.queryByRole("heading", { name: "Nástupce císaře" })).toBeNull();
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.getByRole("heading", { name: "Nástupce císaře" })).toBeTruthy();
  expect(polozky("Hráč vyhrává, když drží 7 relikvií 15 herních minut v kuse — při ztrátě se odpočet vynuluje.")).toHaveLength(1);
  expect(screen.getByText("Hráč prohrává, když zemře jeho král.")).toBeTruthy();
  // Cíl každé role ve stejném slohu jako na kartě role.
  expect(polozky(/^Vyhrává, když /)).toHaveLength(6);
  expect(screen.queryByText("Start")).toBeNull();
  expect(screen.queryByText(/Nejvýš/)).toBeNull();
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.queryByRole("heading", { name: "Nástupce císaře" })).toBeNull();
});

// Role v pravidlech v bodech i s výhodami a nevýhodami (uživatel 4. 10. 2026):
// každý ví, co mohou ostatní role — bez čehokoli o konkrétních hráčích.
it("každá role má v pravidlech cíl, výhody i nevýhody", () => {
  render(<PravidlaHry verze={null} />);
  fireEvent.click(screen.getByText("Pravidla hry"));
  for (const role of Object.keys(POPIS_ROLE) as (keyof typeof POPIS_ROLE)[]) {
    for (const v of [...POPIS_ROLE[role].vyhody, ...POPIS_ROLE[role].nevyhody]) expect(polozky(v).length).toBeGreaterThan(0);
  }
});
