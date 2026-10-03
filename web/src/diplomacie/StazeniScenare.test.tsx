import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { VERZE } from "./fixtury.js";
import { cestaKeScenarum, StazeniScenare } from "./StazeniScenare.js";

// Složka scénářů je pojmenovaná podle účtu ve hře: Steam ID, nebo XUID bez
// předpony `xbox:`, kterou web používá jen jako své id hráče (spec §5.3).
it("cesta pro Steam a pro Xbox hráče", () => {
  expect(cestaKeScenarum("76561198014056480")).toBe("%USERPROFILE%\\Games\\Age of Empires 2 DE\\76561198014056480\\resources\\_common\\scenario\\");
  expect(cestaKeScenarum("xbox:2533274952064423")).toBe("%USERPROFILE%\\Games\\Age of Empires 2 DE\\2533274952064423\\resources\\_common\\scenario\\");
});

// Pořadí (uživatel 3. 10. 2026): nejdřív „Stáhnout scénář“, cesta až po kliknutí.
it("host dostane odkaz na verzi zápasu, nebo větu, že scénář chybí", () => {
  const { rerender } = render(<StazeniScenare verze={VERZE} ja="76561198014056480" />);
  const odkaz = screen.getByRole("link", { name: "Stáhnout scénář" });
  expect(odkaz.getAttribute("href")).toMatch(/\/api\/diplo\/scenar\/3\/soubor$/);
  expect(screen.queryByText("Ulož scénář do:")).toBeNull();
  fireEvent.click(odkaz);
  expect(screen.getByText("Ulož scénář do:")).toBeTruthy();
  // Věta o Create Lobby tu není: totéž ukazuje okno Create Lobby hned pod tím.
  expect(screen.queryByText(/Create Lobby/)).toBeNull();
  expect(screen.queryByText("Custom Scenario")).toBeNull();
  rerender(<StazeniScenare verze={null} ja="x" />);
  expect(screen.getByText("Scénář zatím nikdo nenahrál.")).toBeTruthy();
});

// Odkaz má atribut download se jménem verze a cesta ke složce je ke
// zkopírování jedním kliknutím, i s jménem souboru v instrukci.
it("odkaz stahuje pod jménem verze a cesta je kopírovatelná", () => {
  render(<StazeniScenare verze={VERZE} ja="xbox:2533274952064423" />);
  const odkaz = screen.getByRole("link", { name: "Stáhnout scénář" });
  expect(odkaz.getAttribute("download")).toBe("ROB_DIPLO_3.aoe2scenario");
  fireEvent.click(odkaz);
  expect(screen.getByRole("button", { name: "Kopírovat cestu ke scénářům" }).textContent).toContain("\\2533274952064423\\resources\\_common\\scenario\\");
});
