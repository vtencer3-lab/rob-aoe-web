import { zamichej, zJednotkove, type Nahoda } from "../michani.js";
import { NAZEV_ROLE } from "./role.js";
import { ROLE_LOSOVANE, type Role, type RoleHrace } from "./typy.js";

export type { Nahoda };
const vychoziNahoda: Nahoda = zJednotkove(Math.random);

const POCET_HRACU = 7;
const S_CILEM: ReadonlySet<Role> = new Set(["kat", "zoldak"]);

export function povoleneCile(hraci: string[], kdo: string, nastupce: string): string[] {
  return hraci.filter((h) => h !== kdo && h !== nastupce);
}

function nahodnyCil(hraci: string[], kdo: string, nastupce: string, nahoda: Nahoda): string {
  const moznosti = povoleneCile(hraci, kdo, nastupce);
  return moznosti[nahoda(moznosti.length)]!;
}

export function losujRole(hraci: string[], nastupce: string, nahoda: Nahoda = vychoziNahoda): RoleHrace[] {
  if (hraci.length !== POCET_HRACU) throw new Error("Diplomacie potřebuje 7 hráčů (bez GM).");
  if (!hraci.includes(nastupce)) throw new Error("Nástupce není mezi hráči.");
  const role = zamichej(ROLE_LOSOVANE, nahoda);
  let i = 0;
  return hraci.map((hracId) => {
    const r: Role = hracId === nastupce ? "nastupce" : role[i++]!;
    return { hracId, role: r, cilHracId: S_CILEM.has(r) ? nahodnyCil(hraci, hracId, nastupce, nahoda) : null };
  });
}

/** GM změní roli: Kat/Žoldák dostane platný cíl (starý platný zůstává), ostatní cíl ztratí. */
export function zmenRoli(role: RoleHrace[], hracId: string, nova: Role, nastupce: string, nahoda: Nahoda = vychoziNahoda): RoleHrace[] {
  if (hracId === nastupce || nova === "nastupce") throw new Error("Nástupce se mění výběrem Nástupce, ne rolí.");
  const hraci = role.map((r) => r.hracId);
  return role.map((r) => {
    if (r.hracId !== hracId) return r;
    if (!S_CILEM.has(nova)) return { ...r, role: nova, cilHracId: null };
    const platny = r.cilHracId !== null && povoleneCile(hraci, hracId, nastupce).includes(r.cilHracId);
    return { ...r, role: nova, cilHracId: platny ? r.cilHracId : nahodnyCil(hraci, hracId, nastupce, nahoda) };
  });
}

export function zmenCil(role: RoleHrace[], hracId: string, cil: string, nastupce: string): RoleHrace[] {
  const hraci = role.map((r) => r.hracId);
  return role.map((r) => {
    if (r.hracId !== hracId) return r;
    if (!S_CILEM.has(r.role)) throw new Error("Cíl má jen Kat a Žoldák.");
    if (!povoleneCile(hraci, hracId, nastupce).includes(cil)) throw new Error("Tenhle cíl není povolený.");
    return { ...r, cilHracId: cil };
  });
}

/** Odchylky od 1+1+2+1+1+1 jako věty pro GM; prázdné = v pořádku. Neblokuje (spec §6.2). */
export function odchylkySlozeni(role: RoleHrace[]): string[] {
  const ocekavane: Record<Role, number> = { nastupce: 1, garda: 1, najezdnik: 2, sasek: 1, zoldak: 1, kat: 1 };
  const pocty = new Map<Role, number>();
  for (const r of role) pocty.set(r.role, (pocty.get(r.role) ?? 0) + 1);
  const vety: string[] = [];
  for (const [r, ma] of Object.entries(ocekavane) as [Role, number][]) {
    const je = pocty.get(r) ?? 0;
    if (je === 0) vety.push(`chybí ${NAZEV_ROLE[r]}`);
    else if (je !== ma) vety.push(`${je}× ${NAZEV_ROLE[r]} (má být ${ma}×)`);
  }
  // Nadbytečné se hlásí před chybějícími — GM hledá, koho přeřadit.
  return vety.sort((a, b) => Number(a.startsWith("chybí")) - Number(b.startsWith("chybí")));
}
