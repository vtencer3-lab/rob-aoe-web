/**
 * Ověřování tvaru dat, která přišla zvenčí (výstup Pythonu, tělo od mostu,
 * JSON z databáze). `co` je, o čem věta mluví („Rozbor“, „Sonda“, „Data ze
 * hry“) — chyba je česká věta, kterou jde ukázat člověku.
 */
export function overovace(co: string) {
  const cislo = (v: unknown, kde: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${co}: ${kde} není číslo.`);
    return v;
  };
  const celeCislo = (v: unknown, kde: string): number => {
    if (!Number.isInteger(v)) throw new Error(`${co}: ${kde} není celé číslo.`);
    return v as number;
  };
  const text = (v: unknown, kde: string): string => {
    if (typeof v !== "string") throw new Error(`${co}: ${kde} není text.`);
    return v;
  };
  const pole = (v: unknown, kde: string): unknown[] => {
    if (!Array.isArray(v)) throw new Error(`${co}: ${kde} není seznam.`);
    return v;
  };
  const objekt = (v: unknown, kde: string): Record<string, unknown> => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${co}: ${kde} chybí.`);
    return v as Record<string, unknown>;
  };
  return { cislo, celeCislo, text, pole, objekt };
}
