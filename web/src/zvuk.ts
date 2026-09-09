/**
 * Přehraje zvuk a mlčí, když nejde.
 *
 * Prohlížeč umí odmítnout autoplay a `play()` nemusí vrátit slib vůbec
 * (jsdom v testech, starší Safari) — v obou případech je správná reakce
 * ticho, ne výjimka v obsluze kliknutí.
 */
export function prehraj(url: string): void {
  const slib = new Audio(url).play() as Promise<void> | undefined;
  void slib?.catch(() => {});
}
