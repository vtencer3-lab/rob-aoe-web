type Odberatel = (payload: unknown) => void;

export class Hub {
  readonly #odberatele = new Map<number, Set<Odberatel>>();

  subscribe(akceId: number, send: Odberatel): () => void {
    let mnozina = this.#odberatele.get(akceId);
    if (!mnozina) {
      mnozina = new Set();
      this.#odberatele.set(akceId, mnozina);
    }
    mnozina.add(send);
    return () => {
      mnozina.delete(send);
      if (mnozina.size === 0) this.#odberatele.delete(akceId);
    };
  }

  publish(akceId: number, payload: unknown): void {
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

export const hub = new Hub();
