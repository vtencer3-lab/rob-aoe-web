import type { RezimAkce } from "../rezimy/index.js";
import { REZIM_SCENARIO, type NastaveniLobby } from "../shared/lobbyKontrola.js";
import { GM_BARVA } from "../shared/diplomacie/sestava.js";
import type { DiploData, ScenarVerze } from "../shared/diplomacie/typy.js";
import { redigujDiplo } from "../shared/diplomacie/viditelnost.js";
import { getAktivniVerze, getDiploZapas, getVerze, listDiploZapasy, listVerzi, zalozDiploZapas } from "./db.js";

/** Co z verzí scénáře patří do nastavení lobby akce (spec §5.5). */
export function nastaveniScenare(aktivni: ScenarVerze | null, vsechny: ScenarVerze[]): Pick<NastaveniLobby, "scenar" | "scenarStarsi"> {
  if (!aktivni) return { scenar: null, scenarStarsi: null };
  const starsi = vsechny.filter((v) => v.id !== aktivni.id && v.jmenoSouboru !== aktivni.jmenoSouboru).map((v) => v.jmenoSouboru);
  return { scenar: aktivni.jmenoSouboru, scenarStarsi: [...new Set(starsi)] };
}

export const diplomacie: RezimAkce = {
  id: "diplomacie",

  async vychoziNastaveniLobby(zaklad) {
    return {
      ...zaklad,
      // Spec §6.1 krok 1: scénář určuje mapu i velikost; diplomacie se mění
      // během hry (Lock Teams vypnuto); spojenci bez společné vize.
      rezim: REZIM_SCENARIO,
      mapaId: null,
      velikost: null,
      populace: 200,
      lockTeams: false,
      teamTogether: null,
      sharedExploration: false,
      cheaty: false,
      povolitDivaky: true,
      maxHracu: 8,
      ...nastaveniScenare(await getAktivniVerze(), await listVerzi()),
    };
  },

  async predZmenouSestavy(zapasId) {
    const d = await getDiploZapas(zapasId);
    if (d && d.stav !== "priprava") return "Role už jsou rozdané — nejdřív Zpět na výběr Nástupce.";
    return null;
  },

  async poVytvoreniZapasu(client, zapasId, sedadla) {
    // Kontrola sestavy šedou vynutila; kdyby tu chyběla, je to chyba kódu.
    if (!sedadla.some((s) => s.barva === GM_BARVA)) throw new Error("Zápas Diplomacie bez hráče na šedé.");
    await zalozDiploZapas(client, zapasId);
  },

  async doplnStav(akce) {
    const zapasy = await listDiploZapasy(akce.id);
    const verze: DiploData["verze"] = {};
    for (const id of new Set(zapasy.map((z) => z.scenarId).filter((id): id is number => id !== null))) {
      const v = await getVerze(id);
      if (v) verze[id] = v;
    }
    return { id: "diplomacie", data: { aktivni: await getAktivniVerze(), verze, zapasy } };
  },

  rediguj(rezim, divak) {
    return { ...rezim, data: redigujDiplo(rezim.data, divak.hracId) };
  },
};
