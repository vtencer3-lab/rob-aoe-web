import type { UcastnikView, ZapasView } from "../../src/shared/types.js";

export function mujUcastnik(zapas: ZapasView, steamId: string): UcastnikView | null {
  return zapas.ucastnici.find((u) => u.steamId === steamId) ?? null;
}

export function spoluhraci(zapas: ZapasView, steamId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, steamId);
  if (!ja) return [];
  return zapas.ucastnici.filter((u) => u.tym === ja.tym && u.steamId !== steamId);
}

export function souperi(zapas: ZapasView, steamId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, steamId);
  if (!ja) return [];
  return zapas.ucastnici.filter((u) => u.tym !== ja.tym);
}

export function mojeZapasy(zapasy: ZapasView[], steamId: string): ZapasView[] {
  return zapasy.filter(
    (z) =>
      z.stav !== "dohrano" && z.stav !== "zruseny" && z.ucastnici.some((u) => u.steamId === steamId),
  );
}
