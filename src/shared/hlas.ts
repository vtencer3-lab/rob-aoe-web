/** Zesílení hlasu mluvčího v procentech: 100 = bez zásahu, 400 = čtyřnásobek. */
export const ZESILENI_MIN = 100;
export const ZESILENI_MAX = 400;

/**
 * Zesílení do povoleného rozsahu; cokoli jiného než číslo je „bez zásahu“.
 * Jedno místo pro prohlížeč (posuvník, přehrávač) i server (kousek hlasu
 * nese zesílení mluvčího a server ho jen přepošle — ale ne větší než strop).
 */
export function orizniZesileni(hodnota: unknown): number {
  return typeof hodnota === "number" && Number.isFinite(hodnota) ? Math.min(ZESILENI_MAX, Math.max(ZESILENI_MIN, Math.round(hodnota))) : ZESILENI_MIN;
}
