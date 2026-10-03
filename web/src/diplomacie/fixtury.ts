import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { DiploData, RoleHrace, ScenarVerze, StavDiplo } from "../../../src/shared/diplomacie/typy.js";
import type { Barva, ZapasView } from "../../../src/shared/types.js";

/** Testovací data Diplomacie pro frontend; jedna sada pro kartu role, veřejný řádek i pult GM. */

export const VERZE: ScenarVerze = { id: 3, jmenoSouboru: "LLC.aoe2scenario", jmenoHry: "ROB_DIPLO_3.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null, minimapaOtisk: null, minimapaVlastni: false, sonda: null };

/** Osm hráčů `h1`…`h8` se jmény „Hráč N“ na barvě N, každý sám za sebe; `h7` sedí na šedé jako GM a hostuje. */
export const ZAPAS: ZapasView = {
  id: 1,
  poradi: 1,
  stav: "bezi",
  nazevLobby: "ROB-01",
  heslo: "",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
  ucastnici: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ hracId: `h${n}`, alias: `Hráč ${n}`, platformaJmeno: null, tym: 0, barva: n as Barva, civ: null, jeHost: n === 7, poradi: n - 1, kliknulPripojit: null })),
};

/**
 * Stav Diplomacie s jedním zápasem (`ZAPAS`), role už zredigované tak, jak je
 * server pošle hráči. Nástupce (`h1`) je vidět až po rozeslání — před ním ho
 * redakce (viditelnost.ts) hráči zatají.
 */
export function stavDiplo(stav: StavDiplo, role: RoleHrace[]): DiploData {
  return {
    aktivni: VERZE,
    verze: { [VERZE.id]: VERZE },
    zapasy: [{ zapasId: ZAPAS.id, gmHracId: "h7", stav, nastupceHracId: stav === "rozeslano" ? "h1" : null, scenarId: VERZE.id, role }],
  };
}
