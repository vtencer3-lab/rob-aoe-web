import { afterEach, expect, it, vi } from "vitest";
import { rezimAkce } from "../rezimy/index.js";
import type { DiploZapas } from "../shared/diplomacie/typy.js";
import { getDiploZapas } from "./db.js";
import { jeGm } from "./opravneni.js";

// Háček se ptá databáze jen na jedno: kdo v zápase sedí na šedé.
vi.mock("./db.js", async (puvodni) => ({ ...(await puvodni<typeof import("./db.js")>()), getDiploZapas: vi.fn() }));

const diplo = (gmHracId: string): DiploZapas => ({ zapasId: 5, gmHracId, stav: "priprava", nastupceHracId: null, scenarId: null, role: [] });

afterEach(() => vi.mocked(getDiploZapas).mockReset());

it("GM je jen hráč na šedé; zápas bez šedé a zápas mimo Diplomacii GM nemá", () => {
  expect(jeGm(diplo("h7"), "h7")).toBe(true);
  expect(jeGm(diplo("h7"), "h1")).toBe(false);
  expect(jeGm(diplo("h7"), null)).toBe(false);
  // Bez hráče na šedé je gmHracId prázdné — nesmí se „shodnout“ s prázdným id.
  expect(jeGm(diplo(""), "")).toBe(false);
  expect(jeGm(null, "h7")).toBe(false);
});

// Push-to-talk (uživatel 2. 10. 2026): GM svolává všechny, i když není admin.
it("háček Diplomacie pustí do zápasu mluvit GM a nikoho jiného", async () => {
  vi.mocked(getDiploZapas).mockResolvedValue(diplo("h7"));
  const rezim = rezimAkce("diplomacie");
  expect(await rezim.smiMluvitDoZapasu(5, "h7")).toBe(true);
  expect(await rezim.smiMluvitDoZapasu(5, "h1")).toBe(false);
  expect(getDiploZapas).toHaveBeenCalledWith(5);
  // Zápas, který Diplomacie nezná.
  vi.mocked(getDiploZapas).mockResolvedValue(null);
  expect(await rezim.smiMluvitDoZapasu(6, "h7")).toBe(false);
});

it("klasický večer hlas nikomu navíc nedává a na databázi nesahá", async () => {
  expect(await rezimAkce("klasicky").smiMluvitDoZapasu(5, "h7")).toBe(false);
  expect(getDiploZapas).not.toHaveBeenCalled();
});
