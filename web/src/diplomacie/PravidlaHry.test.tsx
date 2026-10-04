import { POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { VERZE as verze } from "./fixtury.js";
import { PravidlaHry } from "./PravidlaHry.js";

it("pravidla vypíšou cíle s čísly ze scénáře a limity", () => {
  render(<PravidlaHry verze={verze} />);
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.getByText(/Zabij 650 nepratelskych jednotek/)).toBeTruthy();
  expect(screen.getByText(/Nejvýš 30 vesničanů/)).toBeTruthy();
  expect(screen.getByText("Nástupce císaře")).toBeTruthy();
  expect(screen.getByText(/Vlastní podmínky scénáře/)).toBeTruthy();
});

// Sbalený tahák nemá tělo v DOM: karta role vedle něj je jediné místo, kde
// jméno role hráče je. Bez rozboru (žádná verze) zůstanou jen texty rolí.
it("sbalený tahák nic nevypisuje; bez rozboru jen role a primární cíle", () => {
  render(<PravidlaHry verze={null} />);
  expect(screen.queryByText("Nástupce císaře")).toBeNull();
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.getByText("Nástupce císaře")).toBeTruthy();
  expect(screen.getByText("Hráč vyhrává, když drží 7 relikvií 15 herních minut.")).toBeTruthy();
  expect(screen.getByText("Hráč prohrává, když zemře jeho král.")).toBeTruthy();
  // Cíl každé role ve stejném slohu jako na kartě role.
  expect(screen.getAllByText(/^Vyhrává, když /)).toHaveLength(6);
  expect(screen.queryByText("Start")).toBeNull();
  expect(screen.queryByText(/Nejvýš/)).toBeNull();
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.queryByText("Nástupce císaře")).toBeNull();
});

// Role v pravidlech v bodech i s výhodami a nevýhodami (uživatel 4. 10. 2026):
// každý ví, co mohou ostatní role — bez čehokoli o konkrétních hráčích.
it("každá role má v pravidlech cíl, výhody i nevýhody", () => {
  render(<PravidlaHry verze={null} />);
  fireEvent.click(screen.getByText("Pravidla hry"));
  for (const role of Object.keys(POPIS_ROLE) as (keyof typeof POPIS_ROLE)[]) {
    for (const v of [...POPIS_ROLE[role].vyhody, ...POPIS_ROLE[role].nevyhody]) expect(screen.getAllByText(v).length).toBeGreaterThan(0);
  }
});
