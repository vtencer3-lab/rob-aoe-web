import type { AkceStavPayload } from "../shared/types.js";

type Odberatel<T> = (payload: T) => void;

/**
 * Jediný kanál, na kterém se rozesílá stav akce — a to schválně, ne z lenosti.
 *
 * Klíčovat odběr podle id akce vypadalo přirozeně, ale nic to nepřinášelo:
 * `buildAkceStav()` žádné id nebere, vždycky staví stav té jedné otevřené akce
 * (migrace 003 víc než jednu nepustí). Všichni odběratelé tedy stejně dostávali
 * tentýž payload. Zato to spolehlivě rozbíjelo večer, ve kterém akce skončila
 * a začala další: kdo měl stránku otevřenou z té první, zůstal viset na kanálu,
 * kam už nikdy nic nepřišlo. Viděl „Právě neběží žádná akce.“ a zároveň
 * dostával od serveru 409 „Ještě běží jiná akce.“ — dokud stránku neobnovil.
 */
export const KANAL_AKCE = 0;

/**
 * Generický, aby ho šlo testovat s libovolným payloadem (viz hub.test.ts).
 * Skutečná instance {@link hub} je ale typovaná na {@link AkceStavPayload} —
 * chybný publish tak spadne na kompilaci, ne až za běhu uvnitř redakce.
 */
export class Hub<T = unknown> {
  readonly #odberatele = new Map<number, Set<Odberatel<T>>>();

  subscribe(akceId: number, send: Odberatel<T>): () => void {
    let mnozina = this.#odberatele.get(akceId);
    if (!mnozina) {
      mnozina = new Set();
      this.#odberatele.set(akceId, mnozina);
    }
    mnozina.add(send);
    // Zavřeme si nad množinou, ve které jsme opravdu byli — když odhlášení
    // zavoláme dvakrát (např. jednou z 'close' a jednou z chybové větve),
    // druhé volání nesmí smazat záznam v mapě, pokud mezitím vznikl nový
    // odběratel se stejným akceId (jinak by o svůj odběr tiše přišel).
    const tatoMnozina = mnozina;
    return () => {
      tatoMnozina.delete(send);
      if (tatoMnozina.size === 0 && this.#odberatele.get(akceId) === tatoMnozina) {
        this.#odberatele.delete(akceId);
      }
    };
  }

  publish(akceId: number, payload: T): void {
    const mnozina = this.#odberatele.get(akceId);
    if (!mnozina) return;
    for (const send of mnozina) {
      // Rozpadlé spojení nesmí zabránit doručení ostatním.
      try {
        send(payload);
      } catch {
        mnozina.delete(send);
      }
    }
  }

  subscriberCount(akceId: number): number {
    return this.#odberatele.get(akceId)?.size ?? 0;
  }
}

export const hub = new Hub<AkceStavPayload>();
