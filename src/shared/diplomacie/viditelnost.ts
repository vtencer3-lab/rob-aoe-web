import { vidiHrac } from "./schopnosti.js";
import type { DiploData, DiploZapas, RoleHrace } from "./typy.js";

/**
 * Bezpečnostní hranice Diplomacie (spec §7). Jediné místo, kde se rozhoduje,
 * kdo uvidí cizí roli. Admin tu **nemá výjimku**: kdo není GM zápasu, je
 * obyčejný divák — Rob streamuje a role by se objevily ve vysílání.
 */
export function redigujDiplo(data: DiploData, divakHracId: string | null, nahled = false): DiploData {
  return { ...data, zapasy: data.zapasy.map((z) => redigujZapas(z, divakHracId, nahled)) };
}

/**
 * Jediná výjimka (uživatel 4. 10. 2026): kdo má právo náhledu
 * (`DIPLO_NAHLED`, rozhoduje server), dostane navíc celý zápas ve větvi
 * `nahled` — i v zápase, kde sám hraje (moderuje jako GM). Jeho vlastní
 * pohled zůstává redigovaný; panel náhledu je na webu sbalený, ať si nic
 * nevyzradí omylem.
 */
function redigujZapas(cely: DiploZapas, divak: string | null, nahled: boolean): DiploZapas {
  const z = redigujPohled(cely, divak);
  return nahled && divak !== null && divak !== cely.gmHracId ? { ...z, nahled: cely } : z;
}

function redigujPohled(cely: DiploZapas, divak: string | null): DiploZapas {
  if (divak !== null && divak === cely.gmHracId) return cely;
  // Data ze hry (kdo má jaký cíl, kdo je podle hry Nástupce) prozrazují
  // totéž co role — patří jen GM, v každém stavu.
  const z = { ...cely };
  delete z.hra;
  // Žádosti o schopnosti: hráč jen své (cíl Sabotáže je tajemství Nájezdníka a GM)
  // a povinnost prodat relikvie, je-li jeho.
  delete z.schopnosti;
  const mojeZadosti = (cely.schopnosti ?? []).filter((s) => divak !== null && s.hracId === divak && vidiHrac(s.druh));
  if (mojeZadosti.length > 0) z.schopnosti = mojeZadosti;
  // Ping GM vidí hráč, kterému patří (nebo všem); cizí pingy ne.
  if (cely.pingy) {
    const moje = cely.pingy.filter((p) => p.komu === null || (divak !== null && p.komu.includes(divak)));
    if (moje.length > 0) z.pingy = moje;
    else delete z.pingy;
  }
  // Vlastního krále hráč vidí vždy — jeho poloha neprozradí nic tajného.
  const kral = divak === null ? null : (cely.hra?.hraci.find((h) => h.hracId === divak)?.kral ?? null);
  if (kral) z.mujKral = kral;
  const rozeslano = z.stav === "rozeslano";
  const moje = !rozeslano || divak === null ? undefined : z.role.find((r) => r.hracId === divak);
  // Vlastní postup hráč vidí i ve hře; stav hráčů, na kterých závisí jeho
  // výhra, jen podle role, kterou už zná.
  const ja = divak === null ? undefined : cely.hra?.hraci.find((h) => h.hracId === divak);
  if (cely.hra && ja) {
    const sledovani = (moje ? koho(moje, cely.nastupceHracId) : []).map((hracId) => ({ hracId, zije: cely.hra!.hraci.find((h) => h.hracId === hracId)?.zije ?? null }));
    z.mojeHra = { cas: cely.hra.cas, prijato: cely.hra.prijato, rozdano: cely.hra.rozdano, cil: ja.cil, relikvie: ja.relikvie, drzeni: ja.drzeni ?? null, sledovani };
  }
  if (!rozeslano) return { ...z, nastupceHracId: null, role: [] };
  if (!moje) return { ...z, role: [] };
  // Garda se dozví roli každého padlého (výhoda role) — bez cíle Kata či Žoldáka.
  if (moje.role === "garda" && cely.hra) {
    const odhalene = cely.hra.hraci
      .filter((h) => h.zije === false && h.hracId !== moje.hracId)
      .flatMap((h) => {
        const r = z.role.find((x) => x.hracId === h.hracId);
        return r ? [{ hracId: r.hracId, role: r.role }] : [];
      });
    if (odhalene.length > 0) z.odhaleneRole = odhalene;
  }
  // Nájezdníci se znají od začátku hry; nikdo jiný o nikom nic neví.
  const vidi = moje.role === "najezdnik" ? z.role.filter((r) => r.role === "najezdnik") : [moje];
  return { ...z, role: vidi };
}

/** Na čím životě závisí výhra role: oběť Kata, pouto Žoldáka, Nástupce u Gardy a Nájezdníka. */
function koho(r: RoleHrace, nastupce: string | null): string[] {
  if ((r.role === "kat" || r.role === "zoldak") && r.cilHracId) return [r.cilHracId];
  if ((r.role === "garda" || r.role === "najezdnik") && nastupce) return [nastupce];
  return [];
}
