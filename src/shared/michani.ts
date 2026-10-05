/**
 * Náhoda 0 ≤ x < n (celé číslo). Ve sdíleném kódu bez `node:crypto` (běží
 * i v prohlížeči); server předává `randomInt` z `node:crypto`, testy
 * deterministickou funkci.
 */
export type Nahoda = (n: number) => number;

/** Z náhody tvaru `Math.random` (0 ≤ x < 1) udělá `Nahoda`. */
export function zJednotkove(nahoda: () => number): Nahoda {
  return (n) => Math.floor(nahoda() * n);
}

/** Fisher–Yates; jako v Jinově nástroji, jen s volitelnou náhodou. */
export function zamichej<T>(pole: readonly T[], nahoda: Nahoda): T[] {
  const p = [...pole];
  for (let i = p.length - 1; i > 0; i--) {
    const j = nahoda(i + 1);
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return p;
}

/**
 * Zamíchané pořadí, které se od původního určitě liší (má-li pole aspoň dva
 * prvky): když náhoda vrátí totéž pořadí, posune se o jedno místo. Bez toho
 * by „zamíchat“ u dvou prvků v půlce případů neudělalo nic a uživatel by
 * klikal do prázdna.
 */
export function zamichejJinak<T>(pole: readonly T[], nahoda: Nahoda): T[] {
  const p = zamichej(pole, nahoda);
  if (p.length < 2 || p.some((x, i) => x !== pole[i])) return p;
  return [...p.slice(1), p[0]!];
}
