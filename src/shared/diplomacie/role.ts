import type { Role } from "./typy.js";

export const NAZEV_ROLE: Record<Role, string> = {
  nastupce: "Nástupce císaře",
  garda: "Královská Garda",
  najezdnik: "Nájezdník",
  sasek: "Šašek",
  zoldak: "Žoldák",
  kat: "Kat",
};

export interface PopisRole {
  cil: string;
  vyhody: string[];
  nevyhody: string[];
}

/**
 * Z pravidel hry (Jin, „Diplomacie – Ať žije císař"). Měnit jen spolu s pravidly.
 * 2. 10. 2026: „ekonomická sankce“ Nájezdníků se jmenuje Sabotáž a každý
 * Nájezdník ji má jen jednu za hru (dřív 1× na každého hráče). Sankce z Rady
 * králů u Nástupce je jiná věc a zůstává.
 */
export const POPIS_ROLE: Record<Role, PopisRole> = {
  nastupce: {
    cil: "Získat 7 relikvií a ubránit je po dobu 15 minut.",
    vyhody: ["Je veřejně znám od začátku hry.", "Začíná s +2 relikviemi.", "Nelze na něj uvalit sankci z Rady králů."],
    nevyhody: [
      "Nemůže svolávat rady.",
      "Může vyhrát pouze skrze relikvie.",
      "Pokud zemře Šašek, musí prodat 1 relikvii (neplatí, pokud už běží 15minutový win timer se 7 relikviemi).",
    ],
  },
  garda: {
    cil: "Vyhrává jen, když Nástupce císaře nezemře. Může vyhrát i splněním primárního či sekundárního cíle, pokud Nástupce stále žije. Když Nástupce vyhraje, vyhrává Garda také.",
    vyhody: ["Jakmile jakýkoli hráč zemře nebo rezignuje, dozví se od GM jeho přesnou roli."],
    nevyhody: ["Pokud Nástupce zemře, Garda automaticky prohrává a rezignuje."],
  },
  najezdnik: {
    cil: "Vyhrát lze jen tehdy, je-li Nástupce císaře poražen. Plní primární i sekundární cíle. Když vyhraje jeden Nájezdník, druhý vyhrává také (i když už byl vyřazen).",
    vyhody: ["Nájezdníci se znají od začátku hry.", "Každý Nájezdník může jednou za hru provést Sabotáž proti kterémukoli hráči (na jednoho hráče nejvýš jedna; stojí 2000 zlata zaplacené GM)."],
    nevyhody: [],
  },
  sasek: {
    cil: "Splnit primární nebo sekundární cíl. Vyhrává sám za sebe bez ohledu na aliance.",
    vyhody: ["Začíná s 1 relikvií přidělenou GM.", "Až 3× za hru může od GM vyžádat pravdivou tajnou informaci (např. roli konkrétního hráče nebo počet relikvií)."],
    nevyhody: [
      "Pokud zemře Nástupce, musí prodat všechny své relikvie (neplatí při běžícím win timeru).",
      "Pokud zemře Královská Garda, tajně se stává novou Gardou (ztrácí výhody Šaška).",
    ],
  },
  zoldak: {
    cil: "Splnit primární či sekundární cíl, nebo vyhrát skrze pokrevní pouto: když zvolený hráč vyhraje nebo prohraje, Žoldák vyhrává nebo prohrává s ním. Když sám splní cíl, vyhrává samostatně.",
    vyhody: ["Při prodeji relikvie získá dvojnásobek zlata (8000; doplňuje GM)."],
    nevyhody: [],
  },
  kat: {
    cil: "Splnit primární či sekundární cíl a vykonat popravu: dokud určený hráč nezemře (kýmkoli), Kat nemůže vyhrát.",
    vyhody: ["Dostává 2000 zlata za každého hráče, který rezignuje nebo prohraje."],
    nevyhody: [],
  },
};
