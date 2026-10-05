import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AkceStavPayload } from "../../../src/shared/types.js";
import { stavDiplo, ZAPAS } from "./fixtury.js";
import { diplomacieKlient } from "./index.js";

vi.mock("./SpravaScenare.js", () => ({ SpravaScenare: () => <p>SPRAVA</p> }));

const hlidej = async () => {};
// GM fixtury je h7 (šedá), zápas běží.
const stav = { zapasy: [ZAPAS], rezim: { id: "diplomacie", data: stavDiplo("rozeslano", []) } } as unknown as AkceStavPayload;

// Správu scénáře vidí admin a autor (server: smiSpravovat) a GM běžícího
// zápasu Diplomacie (uživatel 5. 10. 2026); obyčejný hráč ne.
it("správa scénáře: GM běžícího zápasu ano, hráč ne, s právem ze serveru ano", () => {
  const ukaz = (ja: string, smiSpravovat: boolean) => render(<>{diplomacieKlient.sprava!({ stav, ja, smiSpravovat, hlidej })}</>).container.textContent;
  expect(ukaz("h7", false)).toBe("SPRAVA");
  expect(ukaz("h1", false)).toBe("");
  expect(ukaz("h1", true)).toBe("SPRAVA");
});
