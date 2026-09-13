import type { KontrolaLobbyVysledek, NastaveniLobby } from "../../src/shared/lobbyKontrola.js";
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

export interface Nastaveni {
  verze: string;
  zkusebniHraci: boolean;
}

export const api = {
  me: () => fetch(cesta("/api/me")).then((r) => json<Me>(r)),
  nastaveni: () => fetch(cesta("/api/nastaveni")).then((r) => json<Nastaveni>(r)),
  pridatZkusebniho: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/zkusebni-hraci`), { method: "POST" }).then((r) => json<{ pridan: string }>(r)),
  odebratZkusebni: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/zkusebni-hraci`), { method: "DELETE" }).then((r) => json<{ odebrano: number }>(r)),
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
  /** Přejmenování běžící akce (tužka u nadpisu panelu). */
  prejmenovatAkci: (akceId: number, nazev: string) =>
    fetch(cesta(`/api/akce/${akceId}/nazev`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazev }),
    }).then((r) => json<{ akce: { id: number } }>(r)),
  /** „Jsem tu!“ — vrátí přihlášce plnou lhůtu aktivity. */
  jsemTu: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/jsem-tu`), { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  /** Debug mód: přetočí lhůty aktivity o daný počet minut dopředu. */
  pretocitCas: (akceId: number, minut: number) =>
    fetch(cesta(`/api/akce/${akceId}/pretocit-cas`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minut }),
    }).then((r) => json<{ minut: number; dotcenych: number }>(r)),
  /** Puls od kliknutí do stránky. Server sám rozhodne, jestli lhůtu posune. */
  aktivita: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/aktivita`), { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  odhlasitSe: () => fetch(cesta("/api/auth/logout"), { method: "POST" }),
  pripojeni: (zapasId: number) =>
    fetch(cesta(`/api/zapas/${zapasId}/pripojeni`), { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  vlozitOdkaz: (zapasId: number, odkaz: string) =>
    fetch(cesta(`/api/zapas/${zapasId}/lobby`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ odkaz }),
    }).then((r) => json<{ ok: true }>(r)),
  kontrolaLobby: (zapasId: number) =>
    fetch(cesta(`/api/zapas/${zapasId}/kontrola-lobby`), { method: "POST" }).then((r) =>
      json<KontrolaLobbyVysledek>(r),
    ),
  nastaveniLobby: (akceId: number, nastaveni: NastaveniLobby) =>
    fetch(cesta(`/api/akce/${akceId}/nastaveni-lobby`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nastaveni),
    }).then((r) => json<{ akce: { id: number } }>(r)),
  lhutaAktivity: (akceId: number, minut: number) =>
    fetch(cesta(`/api/akce/${akceId}/lhuta-aktivity`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minut }),
    }).then((r) => json<{ akce: { id: number } }>(r)),
  /** Zvonek u hráče: svolání do radnice, hráči zazvoní poplach. */
  svolat: (akceId: number, steamId: string) =>
    fetch(cesta(`/api/akce/${akceId}/hraci/${steamId}/svolat`), { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  /** Kostka u hesla v okně Pre-Lobby: nové heslo večera pro lobby, které teprve vzniknou. */
  pristiHeslo: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/pristi-heslo`), { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  ulozitNastaveniLobby: (akceId: number) =>
    fetch(cesta(`/api/akce/${akceId}/nastaveni-lobby/ulozit`), { method: "POST" }).then((r) => json<{ akce: { id: number } }>(r)),
  skladani: (akceId: number, sestava: SestavaVstup[]) =>
    fetch(cesta(`/api/akce/${akceId}/skladani`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sestava }),
    }).then((r) => json<{ akce: { id: number } }>(r)),
  /** Úprava založeného zápasu (ozubené kolečko v režii). */
  nastaveniZapasu: (zapasId: number, nastaveni: NastaveniLobby) =>
    fetch(cesta(`/api/zapas/${zapasId}/nastaveni`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nastaveni),
    }).then((r) => json<{ ok: true }>(r)),
  nazevLobbyZapasu: (zapasId: number, nazevLobby: string) =>
    fetch(cesta(`/api/zapas/${zapasId}/nazev-lobby`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazevLobby }),
    }).then((r) => json<{ ok: true }>(r)),
  sestavaZapasu: (zapasId: number, sestava: SestavaVstup[]) =>
    fetch(cesta(`/api/zapas/${zapasId}/sestava`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sestava }),
    }).then((r) => json<{ ok: true }>(r)),
  upravitZpravu: (zapasId: number, zpravaId: number, text: string) =>
    fetch(cesta(`/api/zapas/${zapasId}/zprava/${zpravaId}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => json<{ ok: true }>(r)),
  smazatZpravu: (zapasId: number, zpravaId: number) =>
    fetch(cesta(`/api/zapas/${zapasId}/zprava/${zpravaId}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  /** Zpráva do chatu zápasu; odpověď je jen ok, zpráva přijde přes SSE. */
  zprava: (zapasId: number, text: string) =>
    fetch(cesta(`/api/zapas/${zapasId}/zprava`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
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
  zavritZapas: (zapasId: number) =>
    fetch(cesta(`/api/zapas/${zapasId}/zavrit`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zavreny: true }),
    }).then((r) => json<{ ok: true }>(r)),
  smazatZapas: (zapasId: number) =>
    fetch(cesta(`/api/zapas/${zapasId}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
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
