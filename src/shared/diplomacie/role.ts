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
 * Nájezdník ji má jen jednu za hru (dřív 1× na každého hráče). Sankce Rady
 * králů u Nástupce je jiná věc a zůstává.
 *
 * Sloh je pro všechny role jeden (uživatel 2. 10. 2026): cíl začíná
 * „Vyhrává, když …“, výhody a nevýhody jsou krátké věcné věty ve 3. osobě.
 * Novou větu piš stejně — test v role.test.ts to hlídá.
 */
export const POPIS_ROLE: Record<Role, PopisRole> = {
  nastupce: {
    cil: "Vyhrává, když získá 7 relikvií a udrží je 15 minut.",
    vyhody: ["Je veřejně znám od začátku hry.", "Začíná se 2 relikviemi navíc.", "Nelze na něj uvalit sankci Rady králů."],
    nevyhody: [
      "Nemůže svolávat rady.",
      "Může vyhrát jen relikviemi.",
      "Když zemře Šašek, musí prodat 1 relikvii (neplatí, pokud už běží 15minutový odpočet se 7 relikviemi).",
    ],
  },
  garda: {
    cil: "Vyhrává, když vyhraje Nástupce císaře, nebo když sama splní primární či sekundární cíl a Nástupce přitom žije.",
    vyhody: ["Když kterýkoli hráč zemře nebo rezignuje, dozví se od GM jeho roli."],
    nevyhody: ["Když Nástupce zemře, prohrává a rezignuje."],
  },
  najezdnik: {
    cil: "Vyhrává, když je Nástupce císaře poražen a Nájezdník splní primární nebo sekundární cíl. Vyhrává i tehdy, když vyhraje druhý Nájezdník (i po vlastním vyřazení).",
    vyhody: [
      "Zná druhého Nájezdníka od začátku hry.",
      "Jednou za hru může provést Sabotáž proti kterémukoli hráči (na jednoho hráče nejvýš jedna; stojí 2000 zlata zaplacených GM).",
    ],
    nevyhody: [],
  },
  sasek: {
    cil: "Vyhrává, když splní primární nebo sekundární cíl. Vyhrává sám za sebe, bez ohledu na aliance.",
    vyhody: ["Začíná s 1 relikvií od GM.", "Až 3× za hru si může od GM vyžádat pravdivou tajnou informaci (např. roli hráče nebo počet relikvií)."],
    nevyhody: [
      "Když zemře Nástupce, musí prodat všechny své relikvie (neplatí při běžícím odpočtu vítězství).",
      "Když zemře Královská Garda, tajně se stává novou Gardou a ztrácí výhody Šaška.",
    ],
  },
  zoldak: {
    cil: "Vyhrává, když splní primární nebo sekundární cíl (pak vyhrává samostatně), nebo když vyhraje hráč, se kterým má pokrevní pouto. Když tento hráč prohraje, prohrává i Žoldák.",
    vyhody: ["Za prodej relikvie dostává dvojnásobek zlata (8000; rozdíl doplácí GM)."],
    nevyhody: [],
  },
  kat: {
    cil: "Vyhrává, když splní primární nebo sekundární cíl a jeho oběť je mrtvá. Oběť může zabít kdokoli.",
    vyhody: ["Dostává 2000 zlata za každého hráče, který rezignuje nebo prohraje."],
    nevyhody: [],
  },
};
