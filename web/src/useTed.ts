import { useEffect, useState } from "react";

/**
 * Hodiny, které tikají samy: komponenta, která ukazuje stáří nebo zbývající
 * čas, se bez nich překreslí až s příští zprávou ze serveru.
 */
export function useTed(intervalMs: number): number {
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTed(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return ted;
}
