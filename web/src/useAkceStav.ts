import { useEffect, useState } from "react";
import type { AkceStavPayload } from "../../src/shared/types.js";

/**
 * Server posílá celý stav akce, ne přírůstky. Proto se tady nic neskládá —
 * poslední přijatá zpráva je pravda a obnova po výpadku spojení je zdarma.
 */
export function useAkceStav(): { stav: AkceStavPayload | null; spojeno: boolean } {
  const [stav, setStav] = useState<AkceStavPayload | null>(null);
  const [spojeno, setSpojeno] = useState(false);

  useEffect(() => {
    const zdroj = new EventSource("/api/stream");
    zdroj.onopen = () => setSpojeno(true);
    zdroj.onerror = () => setSpojeno(false);
    zdroj.onmessage = (udalost) => {
      setStav(JSON.parse(udalost.data) as AkceStavPayload);
      setSpojeno(true);
    };
    return () => zdroj.close();
  }, []);

  return { stav, spojeno };
}
