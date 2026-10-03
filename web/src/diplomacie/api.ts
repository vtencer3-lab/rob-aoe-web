import type { SouhrnSondy } from "../../../src/shared/diplomacie/hra.js";
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
  mapa: (zapasId: number, zmena: { kralove?: boolean; relikvie?: boolean }) => post(`/api/diplo/zapas/${zapasId}/mapa`, zmena),
  ping: (zapasId: number, x: number, y: number, komu: string | null) => post(`/api/diplo/zapas/${zapasId}/ping`, { x, y, komu }),
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
   * v hlavičce, URL-kódované, protože hlavička diakritiku neunese. Poznámku
   * („Co je nového“) formulář od 2. 10. 2026 nemá a neposílá.
   */
  nahrat: (soubor: File) =>
    fetch(cesta("/api/diplo/scenar"), {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-jmeno-souboru": encodeURIComponent(soubor.name),
      },
      body: soubor,
    }).then((r) => json<{
        id: number;
        aktivni: boolean;
        chybaRozboru: string | null;
        chybaSondy: string | null;
        /** Převzetí vlastní minimapy z dřívější verze; null = žádná ji nemá. */
        vlastniMinimapa: { zdrojId: number; prevzata: boolean } | null;
      }>(r)),
  aktivovat: (id: number) => post(`/api/diplo/scenar/${id}/aktivni`),
  /** Smaže verzi; aktivní nebo hranou běžícím zápasem server odmítne (409 s důvodem). */
  smazat: (id: number) => fetch(cesta(`/api/diplo/scenar/${id}`), { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  /** Verze `id` převezme vlastní minimapu (obrázek ze hry) verze `zdrojId`; jiná mapa = 409. */
  prevzitMinimapu: (id: number, zdrojId: number) => post(`/api/diplo/scenar/${id}/minimapa-z/${zdrojId}`),
  /** Dopočítá sondu verzi nahrané dřív (nebo po neúspěchu znovu); výsledek nese i případnou chybu. */
  /** Ke stažení jde kopie se sondou; `original` (jen autor a admin) vrátí soubor, jak ho autor nahrál. */
  souborUrl: (id: number | "aktivni", original = false) => cesta(`/api/diplo/scenar/${id}/soubor${original ? "?original=1" : ""}`),
  // Otisk obsahu v adrese: route posílá roční cache a po výměně obrázku u
  // verze by prohlížeč jinak držel starý.
  minimapaUrl: (id: number, otisk: string | null = null) => cesta(`/api/diplo/scenar/${id}/minimapa.webp${otisk ? `?v=${otisk}` : ""}`),
};
