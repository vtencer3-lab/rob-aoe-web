import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { NahledHracu } from "./NahledHracu.js";

vi.mock("../zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70, hlasitostChatu: () => 50 }));

const ROLE = [
  { hracId: "h1", role: "nastupce" as const, cilHracId: null },
  { hracId: "h2", role: "kat" as const, cilHracId: "h4" },
  { hracId: "h4", role: "sasek" as const, cilHracId: null },
];

// Náhled (uživatel 4. 10. 2026): jen u zápasu, ke kterému server poslal celý
// zápas v `nahled`; sbalený, vybraný hráč se ukáže přesně tak, jak se vidí sám.
it("bez náhledu nic; s ním sbalený panel, výběr hráče a jeho karta", () => {
  const data = stavDiplo("rozeslano", ROLE);
  const { rerender } = render(<NahledHracu zapas={zapas} data={data} />);
  expect(screen.queryByTestId("nahled-hracu")).toBeNull();
  // Server pošle vlastní pohled redigovaný a celý zápas zvlášť v `nahled`.
  const plny = data.zapasy[0]!;
  rerender(<NahledHracu zapas={zapas} data={{ ...data, zapasy: [{ ...plny, role: [], nahled: plny }] }} />);
  // Sbalené: obsah v DOM není, dokud se panel nerozbalí.
  expect(screen.queryByRole("button", { name: /Čí pohled zobrazit/ })).toBeNull();
  fireEvent.click(screen.getByText(/Náhled zápasu/));
  fireEvent.click(screen.getByRole("button", { name: /Čí pohled zobrazit/ }));
  fireEvent.click(screen.getByRole("option", { name: /Hráč 2/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByRole("heading", { name: "Popravčí" })).toBeTruthy();
  // Karta vybraného hráče nevidí cizí role (redakce za něj).
  expect(screen.queryByRole("heading", { name: "Šašek" })).toBeNull();
});
