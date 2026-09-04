import type { AkceStavPayload, Format } from "../../src/shared/types.js";

export interface Me {
  hrac: { steamId: string; alias: string | null; jeAdmin: boolean } | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const telo = (await res.json().catch(() => ({ chyba: "Neznámá chyba." }))) as { chyba?: string };
    throw new Error(telo.chyba ?? `Server odpověděl ${res.status}.`);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => fetch("/api/me").then((r) => json<Me>(r)),
  akce: () => fetch("/api/akce").then((r) => json<AkceStavPayload>(r)),
  prihlasit: (akceId: number) =>
    fetch(`/api/akce/${akceId}/prihlaska`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  odhlasit: (akceId: number) =>
    fetch(`/api/akce/${akceId}/prihlaska`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  odhlasitSe: () => fetch("/api/auth/logout", { method: "POST" }),
  pripojeni: (zapasId: number) =>
    fetch(`/api/zapas/${zapasId}/pripojeni`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  vlozitOdkaz: (zapasId: number, odkaz: string) =>
    fetch(`/api/zapas/${zapasId}/lobby`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ odkaz }),
    }).then((r) => json<{ ok: true }>(r)),
  potvrdit: (zapasId: number) =>
    fetch(`/api/zapas/${zapasId}/potvrzeni`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  vytvoritZapas: (akceId: number, format: Format, steamIds: string[]) =>
    fetch(`/api/akce/${akceId}/zapas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format, steamIds }),
    }).then((r) => json<{ zapas: { id: number } }>(r)),
  zapasStav: (zapasId: number, stav: string) =>
    fetch(`/api/zapas/${zapasId}/stav`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stav }),
    }).then((r) => json<{ ok: true }>(r)),
  vysledek: (zapasId: number, viteznyTym: number) =>
    fetch(`/api/zapas/${zapasId}/vysledek`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ viteznyTym }),
    }).then((r) => json<{ ok: true }>(r)),
  zmenitHosta: (zapasId: number, steamId: string) =>
    fetch(`/api/zapas/${zapasId}/host`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steamId }),
    }).then((r) => json<{ ok: true }>(r)),
};
