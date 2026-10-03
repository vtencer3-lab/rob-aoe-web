import type { DiploData, DiploZapas } from "./typy.js";

/**
 * Bezpečnostní hranice Diplomacie (spec §7). Jediné místo, kde se rozhoduje,
 * kdo uvidí cizí roli. Admin tu **nemá výjimku**: kdo není GM zápasu, je
 * obyčejný divák — Rob streamuje a role by se objevily ve vysílání.
 */
export function redigujDiplo(data: DiploData, divakHracId: string | null): DiploData {
  return { ...data, zapasy: data.zapasy.map((z) => redigujZapas(z, divakHracId)) };
}

function redigujZapas(cely: DiploZapas, divak: string | null): DiploZapas {
  if (divak !== null && divak === cely.gmHracId) return cely;
  // Data ze hry (kdo má jaký cíl, kdo je podle hry Nástupce) prozrazují
  // totéž co role — patří jen GM, v každém stavu.
  const z = { ...cely };
  delete z.hra;
  // Vlastního krále hráč vidí vždy — jeho poloha neprozradí nic tajného.
  const kral = divak === null ? null : (cely.hra?.hraci.find((h) => h.hracId === divak)?.kral ?? null);
  if (kral) z.mujKral = kral;
  if (z.stav !== "rozeslano") return { ...z, nastupceHracId: null, role: [] };
  const moje = divak === null ? undefined : z.role.find((r) => r.hracId === divak);
  if (!moje) return { ...z, role: [] };
  // Nájezdníci se znají od začátku hry; nikdo jiný o nikom nic neví.
  const vidi = moje.role === "najezdnik" ? z.role.filter((r) => r.role === "najezdnik") : [moje];
  return { ...z, role: vidi };
}
