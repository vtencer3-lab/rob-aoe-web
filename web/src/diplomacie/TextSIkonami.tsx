import type { ReactNode } from "react";
import { GM_BARVA } from "../../../src/shared/diplomacie/sestava.js";
import { ZnakBarvy } from "../views/JmenoSBarvou.js";
import { IKONKA_RELIKVIE, IKONKA_ROLE } from "./znaky.js";

/**
 * Text pravidel s ikonkami (uživatel 4. 10. 2026, „IconLinky“): před každý
 * výskyt role ve větě — v jakémkoli pádě („Nástupce císaře“, „Gardou“,
 * „Kata“) — a před relikvie dá malý znak, ať se ve větách dá rychle
 * zorientovat. Text zůstává stejný, ikonka je jen obrázek bez alt.
 * „GM“ dostane šedý čtvereček s číslem 7 jako hráči v sestavě (GM sedí na
 * šedé).
 */
const VZORY: { vzor: string; ikona: string | "gm" }[] = [
  // Delší tvary dřív než kratší („Nástupce císaře“ před „Nástupce“).
  { vzor: "Nástupc\\p{L}*(?: císaře)?", ikona: IKONKA_ROLE.nastupce },
  { vzor: "(?:Královsk\\p{L}* )?Gard\\p{L}*", ikona: IKONKA_ROLE.garda },
  { vzor: "Nájezdník\\p{L}*", ikona: IKONKA_ROLE.najezdnik },
  { vzor: "Šaš(?:ek|k\\p{L}*)", ikona: IKONKA_ROLE.sasek },
  { vzor: "Žoldák\\p{L}*", ikona: IKONKA_ROLE.zoldak },
  { vzor: "Kat(?:a|ovi|em)?(?!\\p{L})", ikona: IKONKA_ROLE.kat },
  { vzor: "[Rr]elikvi\\p{L}*", ikona: IKONKA_RELIKVIE },
  { vzor: "GM(?!\\p{L})", ikona: "gm" },
];
const HLEDANI = new RegExp(VZORY.map((v) => `(${v.vzor})`).join("|"), "gu");

export function TextSIkonami({ text }: { text: string }) {
  const kusy: ReactNode[] = [];
  let od = 0;
  for (const m of text.matchAll(HLEDANI)) {
    const i = m.index ?? 0;
    if (i > od) kusy.push(text.slice(od, i));
    const ikona = VZORY[m.slice(1).findIndex((x) => x !== undefined)]!.ikona;
    kusy.push(
      <span key={i} className="s-ikonou">
        {ikona === "gm" ? (
          <ZnakBarvy barva={GM_BARVA} />
        ) : (
          <img className="ikonka-textu" src={ikona} alt="" width={56} height={56} />
        )}
        {m[0]}
      </span>,
    );
    od = i + m[0].length;
  }
  if (od < text.length) kusy.push(text.slice(od));
  return <>{kusy}</>;
}
