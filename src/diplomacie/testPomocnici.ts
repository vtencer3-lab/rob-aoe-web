import { createAkce, signUp } from "../db/events.js";
import { createZapas } from "../db/matches.js";
import { upsertPlayer } from "../db/players.js";
import { createSession } from "../db/sessions.js";
import type { Barva, RezimId, SestavaVstup } from "../shared/types.js";

export const ROB = "76561198000000041";

/** Přihlášený klient: vrací sid do cookies. */
export async function klient(hracId: string, jeAdmin: boolean): Promise<string> {
  await upsertPlayer(hracId, jeAdmin);
  return createSession(hracId);
}

/** Akce a 8 přihlášených h1…h8 na barvách 1–8 bez týmů; h7 je na šedé (GM). */
export async function akceOsmi(rezim: RezimId = "diplomacie") {
  const akce = await createAkce("Diplo", rezim);
  const sestava: SestavaVstup[] = ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva, tym: 0, civ: null }));
  for (const s of sestava) {
    await upsertPlayer(s.hracId, false);
    await signUp(akce.id, s.hracId);
  }
  return { akce, sestava };
}

/** Totéž a rovnou zápas přes db vrstvu (bez háčků API — ty testují úkoly 8–9 přes inject). */
export async function zapasOsmi(rezim: RezimId = "diplomacie") {
  const { akce, sestava } = await akceOsmi(rezim);
  const zapas = await createZapas(akce.id, sestava);
  return { akce, sestava, zapas };
}
