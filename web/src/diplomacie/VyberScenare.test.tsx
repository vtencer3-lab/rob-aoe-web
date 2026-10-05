import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { diploApi } from "./api.js";
import { stavDiplo, VERZE, ZAPAS } from "./fixtury.js";
import { VyberScenare } from "./VyberScenare.js";

afterEach(() => vi.restoreAllMocks());

const DRUHA = { ...VERZE, id: 4, jmenoHry: "ROB_DIPLO_4_v9.aoe2scenario", aktivni: false, poznamka: "zkouška" };
const BEZ_ROZBORU = { ...VERZE, id: 5, jmenoHry: "ROB_DIPLO_5_v9.aoe2scenario", aktivni: false, rozbor: null };
const hlidej = async (a: () => Promise<unknown>) => {
  await a();
};

// Uživatel 5. 10. 2026: v úpravě zápasu vybrat, na které verzi lobby pojede.
it("nabídne rozebrané verze, uloží výběr a vrátí nastavení lobby do návrhu", async () => {
  vi.spyOn(diploApi, "verze").mockResolvedValue({ verze: [VERZE, DRUHA, BEZ_ROZBORU] });
  const ulozeni = vi.spyOn(diploApi, "scenarZapasu").mockResolvedValue({ ok: true, nastaveni: { scenar: DRUHA.jmenoHry, scenarStarsi: [VERZE.jmenoHry], velikost: 220 } });
  const onVybrano = vi.fn();
  render(<VyberScenare zapas={ZAPAS} diplo={stavDiplo("priprava", []).zapasy[0]!} hlidej={hlidej} onVybrano={onVybrano} />);
  const tlacitko = await screen.findByRole("button", { name: `Verze scénáře zápasu #${ZAPAS.poradi}` });
  expect(tlacitko.textContent).toContain("ROB_DIPLO_3 (aktivní)");
  fireEvent.click(tlacitko);
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["ROB_DIPLO_3 (aktivní)", "ROB_DIPLO_4_v9 — zkouška"]);
  fireEvent.click(screen.getByRole("option", { name: /ROB_DIPLO_4_v9/ }));
  await waitFor(() => expect(onVybrano).toHaveBeenCalledWith({ scenar: DRUHA.jmenoHry, scenarStarsi: [VERZE.jmenoHry], velikost: 220 }));
  expect(ulozeni).toHaveBeenCalledWith(ZAPAS.id, 4);
});

it("po rozdání rolí je výběr zašedlý", async () => {
  vi.spyOn(diploApi, "verze").mockResolvedValue({ verze: [VERZE, DRUHA] });
  render(<VyberScenare zapas={ZAPAS} diplo={stavDiplo("losovano", []).zapasy[0]!} hlidej={hlidej} onVybrano={() => {}} />);
  expect(((await screen.findByRole("button", { name: /Verze scénáře/ })) as HTMLButtonElement).disabled).toBe(true);
});
