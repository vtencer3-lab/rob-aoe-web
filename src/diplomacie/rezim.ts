import type { RezimAkce } from "../rezimy/index.js";
import { REZIM_SCENARIO, type NastaveniLobby } from "../shared/lobbyKontrola.js";
import { GM_BARVA } from "../shared/diplomacie/sestava.js";
import type { DiploData, ScenarVerze } from "../shared/diplomacie/typy.js";
import { redigujDiplo } from "../shared/diplomacie/viditelnost.js";
import { smiGmMluvit } from "./opravneni.js";
import { getAktivniVerze, getDiploZapas, getVerze, ktereZapasyBezi, listDiploZapasy, listVerzi, zalozDiploZapas, zrusNastupceMimoSestavu } from "./db.js";
import { hraZapasu, pametHer, ponechHry } from "./hraPamet.js";

/**
 * Co z verzí scénáře patří do nastavení lobby akce (spec §5.5). Velikost
 * mapy jde z rozboru: v Custom Scenario ji hra v lobby nenabízí a posílá
 * tu ze scénáře, takže odhad podle počtu hráčů by kontrole jen lhal.
 */
export function nastaveniScenare(aktivni: ScenarVerze | null, vsechny: ScenarVerze[]): Pick<NastaveniLobby, "scenar" | "scenarStarsi" | "velikost"> {
  if (!aktivni) return { scenar: null, scenarStarsi: null, velikost: null };
  // Porovnává se jméno pro hru (ROB_DIPLO_<pořadí>) — pod ním hostovi
  // soubor přijde a pod ním ho hra v lobby hlásí; jméno originálu nehraje roli.
  const starsi = vsechny.filter((v) => v.id !== aktivni.id).map((v) => v.jmenoHry);
  return { scenar: aktivni.jmenoHry, scenarStarsi: [...new Set(starsi)], velikost: aktivni.rozbor?.velikostMapy ?? null };
}

/** Totéž z databáze: pro novou akci i pro propsání aktivace do běžící akce (routes.ts). */
export async function nastaveniZAktivniVerze(): Promise<ReturnType<typeof nastaveniScenare>> {
  return nastaveniScenare(await getAktivniVerze(), await listVerzi());
}

export const diplomacie: RezimAkce = {
  id: "diplomacie",

  async vychoziNastaveniLobby(zaklad) {
    return {
      ...zaklad,
      // Spec §6.1 krok 1: scénář určuje mapu i velikost (velikost dodá
      // nastaveniScenare z rozboru); diplomacie se mění během hry (Lock
      // Teams vypnuto); spojenci bez společné vize.
      rezim: REZIM_SCENARIO,
      mapaId: null,
      populace: 200,
      lockTeams: false,
      teamTogether: null,
      sharedExploration: false,
      cheaty: false,
      povolitDivaky: true,
      maxHracu: 8,
      ...(await nastaveniZAktivniVerze()),
    };
  },

  async predZmenouSestavy(zapasId) {
    const d = await getDiploZapas(zapasId);
    if (d && d.stav !== "priprava") return "Role už jsou rozdané — nejdřív Zpět na výběr Nástupce.";
    return null;
  },

  async poZmeneSestavy(zapasId, sestava) {
    // Admin v přípravě vyměnil hráče, kterého GM už odklikl jako Nástupce
    // (nebo ho posadil na šedou): v pultu by nesvítila žádná dlaždice, ale
    // „Rozdat role“ ano. Nástupcem může být jen hráč zápasu mimo GM.
    await zrusNastupceMimoSestavu(zapasId, sestava.filter((s) => s.barva !== GM_BARVA).map((s) => s.hracId));
  },

  async poVytvoreniZapasu(client, zapasId, sedadla) {
    // Kontrola sestavy šedou vynutila; kdyby tu chyběla, je to chyba kódu.
    if (!sedadla.some((s) => s.barva === GM_BARVA)) throw new Error("Zápas Diplomacie bez hráče na šedé.");
    await zalozDiploZapas(client, zapasId);
  },

  async doplnStav(akce) {
    // Data z běžící hry nejsou v databázi; plný stav je nese a redakce je
    // nechá jen GM. Snímky dohraných a zrušených zápasů se zahazují — pult
    // by jinak donekonečna hlásil „hra mlčí“.
    if (pametHer.size > 0) ponechHry(await ktereZapasyBezi([...pametHer.keys()]));
    const zapasy = (await listDiploZapasy(akce.id)).map((z) => {
      const hra = hraZapasu(z.zapasId);
      return hra ? { ...z, hra } : z;
    });
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

  // GM „svolává všechny“ (uživatel 2. 10. 2026): mluví do svého zápasu jako
  // admin z režie, i když admin není.
  smiMluvitDoZapasu: smiGmMluvit,
};
