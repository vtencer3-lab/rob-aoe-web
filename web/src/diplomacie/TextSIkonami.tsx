import type { ReactNode } from "react";
import { ZNAK_RELIKVIE, ZNAK_ROLE } from "./znaky.js";

/**
 * Text pravidel s ikonkami (uživatel 4. 10. 2026, „IconLinky“): před každý
 * výskyt role ve větě — v jakémkoli pádě („Nástupce císaře“, „Gardou“,
 * „Kata“) — a před relikvie dá malý znak, ať se ve větách dá rychle
 * zorientovat. Text zůstává stejný, ikonka je jen obrázek bez alt.
 */
const VZORY: { vzor: string; ikona: string }[] = [
  // Delší tvary dřív než kratší („Nástupce císaře“ před „Nástupce“).
  { vzor: "Nástupc\\p{L}*(?: císaře)?", ikona: ZNAK_ROLE.nastupce },
  { vzor: "(?:Královsk\\p{L}* )?Gard\\p{L}*", ikona: ZNAK_ROLE.garda },
  { vzor: "Nájezdník\\p{L}*", ikona: ZNAK_ROLE.najezdnik },
  { vzor: "Šaš(?:ek|k\\p{L}*)", ikona: ZNAK_ROLE.sasek },
  { vzor: "Žoldák\\p{L}*", ikona: ZNAK_ROLE.zoldak },
  { vzor: "Kat(?:a|ovi|em)?(?!\\p{L})", ikona: ZNAK_ROLE.kat },
  { vzor: "[Rr]elikvi\\p{L}*", ikona: ZNAK_RELIKVIE },
];
const HLEDANI = new RegExp(VZORY.map((v) => `(${v.vzor})`).join("|"), "gu");

export function TextSIkonami({ text }: { text: string }) {
  const kusy: ReactNode[] = [];
  let od = 0;
  for (const m of text.matchAll(HLEDANI)) {
    const i = m.index ?? 0;
    if (i > od) kusy.push(text.slice(od, i));
    const skupina = m.slice(1).findIndex((x) => x !== undefined);
    kusy.push(
      <span key={i} className="s-ikonou">
        <img className="ikonka-textu" src={VZORY[skupina]!.ikona} alt="" width={20} height={20} />
        {m[0]}
      </span>,
    );
    od = i + m[0].length;
  }
  if (od < text.length) kusy.push(text.slice(od));
  return <>{kusy}</>;
}

