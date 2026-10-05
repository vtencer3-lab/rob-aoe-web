import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { stavDiplo } from "./fixtury.js";
import { PravidlaAkce } from "./PravidlaAkce.js";

// Pravidla na stránce akce pro každého (uživatel 4. 10. 2026): velká mapa
// aktivní verze a otevřené kartičky — bez rozbalování a bez rolí hráčů.
it("sekce pravidel ukáže mapu a kartičky pravidel bez rozbalování", () => {
  const data = stavDiplo("priprava", []);
  render(<PravidlaAkce data={{ ...data, aktivni: Object.values(data.verze)[0] ?? data.aktivni }} />);
  expect(screen.getByRole("heading", { name: "Pravidla hry" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Primární cíle" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Popravčí" })).toBeTruthy();
  expect(screen.getByRole("img", { name: /^Mapa scénáře/ })).toBeTruthy();
});
