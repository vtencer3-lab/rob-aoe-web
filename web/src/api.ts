import type { AkceStavPayload } from "../../src/shared/types.js";

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
};
