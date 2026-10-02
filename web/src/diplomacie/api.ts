import type { Role, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { json } from "../api.js";
import { cesta } from "../cesty.js";

/** POST bez těla, nebo s JSON tělem; odpověď je u všech akcí GM jen `ok`. */
const post = (url: string, telo?: object) =>
  fetch(cesta(url), {
    method: "POST",
    headers: telo ? { "content-type": "application/json" } : {},
    body: telo ? JSON.stringify(telo) : undefined,
  }).then((r) => json<{ ok: true }>(r));

/** Routy Diplomacie (server: src/diplomacie/routes.ts), stranou od jádra v `api.ts`. */
export const diploApi = {
  nastupce: (zapasId: number, hracId: string) => post(`/api/diplo/zapas/${zapasId}/nastupce`, { hracId }),
  los: (zapasId: number) => post(`/api/diplo/zapas/${zapasId}/los`),
  role: (zapasId: number, hracId: string, zmena: { role?: Role; cilHracId?: string }) =>
    fetch(cesta(`/api/diplo/zapas/${zapasId}/role/${encodeURIComponent(hracId)}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(zmena),
    }).then((r) => json<{ ok: true }>(r)),
  rozeslat: (zapasId: number) => post(`/api/diplo/zapas/${zapasId}/rozeslat`),
  zpet: (zapasId: number, potvrzeno: boolean) => post(`/api/diplo/zapas/${zapasId}/zpet`, { potvrzeno }),
  verze: () => fetch(cesta("/api/diplo/scenar")).then((r) => json<{ verze: ScenarVerze[] }>(r)),
  /**
   * Soubor jde syrově v těle (žádný multipart — ani nová závislost); jméno
   * a poznámka v hlavičkách, URL-kódované, protože hlavička diakritiku neunese.
   */
  nahrat: (soubor: File, poznamka: string) =>
    fetch(cesta("/api/diplo/scenar"), {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-jmeno-souboru": encodeURIComponent(soubor.name),
        ...(poznamka ? { "x-poznamka": encodeURIComponent(poznamka) } : {}),
      },
      body: soubor,
    }).then((r) => json<{ id: number; aktivni: boolean; chybaRozboru: string | null }>(r)),
  aktivovat: (id: number) => post(`/api/diplo/scenar/${id}/aktivni`),
  souborUrl: (id: number | "aktivni") => cesta(`/api/diplo/scenar/${id}/soubor`),
  // Otisk obsahu v adrese: route posílá roční cache a po výměně obrázku u
  // verze by prohlížeč jinak držel starý.
  minimapaUrl: (id: number, otisk: string | null = null) => cesta(`/api/diplo/scenar/${id}/minimapa.webp${otisk ? `?v=${otisk}` : ""}`),
};
