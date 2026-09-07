import type { AkceStavPayload, HledaniLobbyVysledek, SestavaVstup, Vitez } from "../../src/shared/types.js";
import { cesta } from "./cesty.js";

export interface Me {
  hrac: { steamId: string; alias: string | null; steamName: string | null; jeAdmin: boolean } | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const telo = (await res.json().catch(() => ({ chyba: "Neznámá chyba." }))) as { chyba?: string };
    throw new Error(telo.chyba ?? `Server odpověděl ${res.status}.`);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => fetch(cesta("/api/me")).then((r) => json<Me>(r)),
  akce: () => fetch(cesta("/api/akce")).then((r) => json<AkceStavPayload>(r)),
  vytvoritAkce: (nazev: string) =>
    fetch(cesta("/api/akce"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazev }),
    }).then((r) => json<{ akce: { id: number } }>(r)),
  akceStav: (akceId: number, stav: string) =>
    fetch(cesta(`/api/akce/${akceId}/stav`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stav }),
    }).then((r) => json<{ akce: { id: number } }>(r)),
  prihlasit: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/prihlaska`), { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  odhlasit: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/prihlaska`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  odhlasitSe: () => fetch(cesta("/api/auth/logout"), { method: "POST" }),
  pripojeni: (zapasId: number) =>
    fetch(cesta(`/api/zapas/${zapasId}/pripojeni`), { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  vlozitOdkaz: (zapasId: number, odkaz: string) =>
    fetch(cesta(`/api/zapas/${zapasId}/lobby`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ odkaz }),
    }).then((r) => json<{ ok: true }>(r)),
  hledatLobby: (zapasId: number) =>
    fetch(cesta(`/api/zapas/${zapasId}/hledat-lobby`), { method: "POST" }).then((r) =>
      json<HledaniLobbyVysledek>(r),
    ),
  vytvoritZapas: (akceId: number, sestava: SestavaVstup[]) =>
    fetch(cesta(`/api/akce/${akceId}/zapas`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sestava }),
    }).then((r) => json<{ zapas: { id: number } }>(r)),
  zapasStav: (zapasId: number, stav: string) =>
    fetch(cesta(`/api/zapas/${zapasId}/stav`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stav }),
    }).then((r) => json<{ ok: true }>(r)),
  vysledek: (zapasId: number, vitez: Vitez) =>
    fetch(cesta(`/api/zapas/${zapasId}/vysledek`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vitez }),
    }).then((r) => json<{ ok: true }>(r)),
  zmenitHosta: (zapasId: number, steamId: string) =>
    fetch(cesta(`/api/zapas/${zapasId}/host`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steamId }),
    }).then((r) => json<{ ok: true }>(r)),
};
