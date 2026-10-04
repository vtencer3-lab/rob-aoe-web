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
