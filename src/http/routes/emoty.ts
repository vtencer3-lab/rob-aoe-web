import type { FastifyInstance } from "fastify";

/** Robův Twitch účet (robdiesalot) — 7TV vede sady emotů podle něj. */
export const ROB_TWITCH_ID = "160028137";
/** Jak dlouho se sada drží v paměti; 7TV se ptáme nejvýš jednou za hodinu. */
export const EMOTY_CACHE_MS = 60 * 60 * 1000;

export interface Emote {
  /** Jméno, jak se píše do chatu (rozlišuje velikost písmen). */
  jmeno: string;
  /** Základ adresy na CDN bez přípony velikosti, např. `https://cdn.7tv.app/emote/<id>`. */
  url: string;
  /** Širší než vysoký (WIDE emoty) — chat je nechá roztáhnout. */
  siroky: boolean;
}

interface Sada7tv {
  emote_set?: { name?: string; emotes?: { name: string; id: string; data?: { host?: { url?: string }; animated?: boolean; flags?: number; width?: number; height?: number } }[] };
}

/**
 * Sada 7TV emotů Robova kanálu pro chat (uživatel 13. 9. 2026). Server ji
 * stáhne a hodinu drží, ať 7TV nedostává dotaz od každého prohlížeče —
 * obrázky si pak prohlížeč bere z CDN 7TV přímo.
 */
export function registerEmotyRoutes(app: FastifyInstance, nacti: () => Promise<Emote[]> = nactiZ7tv): void {
  let cache: { kdy: number; emoty: Emote[] } | null = null;
  app.get("/api/emoty", async () => {
    if (!cache || Date.now() - cache.kdy > EMOTY_CACHE_MS) {
      try {
        cache = { kdy: Date.now(), emoty: await nacti() };
      } catch {
        // 7TV neodpovídá: nechat starou sadu, nebo prázdnou; chat bez emotů funguje.
        cache = cache ?? { kdy: Date.now(), emoty: [] };
      }
    }
    return { emoty: cache.emoty };
  });
}

export async function nactiZ7tv(): Promise<Emote[]> {
  const res = await fetch(`https://7tv.io/v3/users/twitch/${ROB_TWITCH_ID}`);
  if (!res.ok) throw new Error(`7TV ${res.status}`);
  const data = (await res.json()) as Sada7tv;
  return prevedSadu(data);
}

export function prevedSadu(data: Sada7tv): Emote[] {
  const emoty: Emote[] = [];
  for (const e of data.emote_set?.emotes ?? []) {
    const host = e.data?.host?.url;
    if (!e.name || !host) continue;
    const url = host.startsWith("//") ? `https:${host}` : host;
    const w = e.data?.width ?? 0;
    const h = e.data?.height ?? 0;
    emoty.push({ jmeno: e.name, url, siroky: w > 0 && h > 0 && w / h > 1.6 });
  }
  return emoty;
}
