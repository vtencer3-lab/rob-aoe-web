/**
 * Náhledy minimap pro výběr mapy. Soubory vyrábí `nastroje/grafika/mapy_nahledy.py`
 * z ikon hry a jmenují se podle id mapy (`src/shared/mapy.ts`), takže tady
 * stačí přečíst složku. Bundler dá každému souboru jen adresu — stáhne se, až
 * ho někdo zobrazí, ne s hlavní stránkou.
 */
const SOUBORY = import.meta.glob("./assets/mapy/*.webp", { eager: true, query: "?url", import: "default" }) as Record<
  string,
  string
>;

export const NAHLEDY_MAP: ReadonlyMap<number, string> = new Map(
  Object.entries(SOUBORY).flatMap(([cesta, url]) => {
    const id = /(\d+)\.webp$/.exec(cesta)?.[1];
    return id ? [[Number(id), url] as const] : [];
  }),
);

export function nahledMapy(id: number | null): string | null {
  return id === null ? null : (NAHLEDY_MAP.get(id) ?? null);
}

/**
 * Doplňkové obrázky (zatím jen náhledy map) se stahují až po načtení hlavní
 * stránky a ve chvíli, kdy prohlížeč nemá nic lepšího na práci. Stránka se
 * otevírá na začátku streamu a nesmí na dvě stě minimap čekat; okno s výběrem
 * se pak ale otevře s hotovými obrázky. `prefetch` nechá prohlížeč stahovat
 * s nízkou prioritou a do mezipaměti, odkud si je `<img>` vezme.
 */
export function donactiDoplnkoveObrazky(urls: Iterable<string> = NAHLEDY_MAP.values(), okno: Window = window): void {
  const doc = okno.document;
  const spust = () => {
    const naplanuj = okno.requestIdleCallback?.bind(okno) ?? ((f: () => void) => okno.setTimeout(f, 1_500));
    naplanuj(() => {
      for (const url of urls) {
        const odkaz = doc.createElement("link");
        odkaz.rel = "prefetch";
        odkaz.as = "image";
        odkaz.href = url;
        doc.head.appendChild(odkaz);
      }
    });
  };
  if (doc.readyState === "complete") spust();
  else okno.addEventListener("load", spust, { once: true });
}
