import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Jak dlouho se sekce rozbaluje a sbaluje. */
const SKLADANI_MS = 280;

/**
 * Sbalovací blok nad `<details>` s plynulým rozbalením i sbalením (uživatel
 * 13. 9. 2026). Prohlížeč umí `<details>` jen skokem, tak se kliknutí na
 * `<summary>` zachytí: při otevření se `open` nastaví hned a tělo dojede
 * z nuly na svou výšku; při zavření tělo napřed sjede na nulu a `open` se
 * odebere až potom. Bez Web Animations (testovací DOM) nebo při
 * `prefers-reduced-motion` se jen přepne.
 *
 * Stav drží volající (`otevreno`/`onPrepnout`), takže si ho může pamatovat
 * přes překreslení i rozhodnout, co se v zavřeném bloku vůbec vykreslí.
 */
export function Skladaci({
  hlava,
  testId,
  className = "dalsi-nastaveni",
  otevreno,
  onPrepnout,
  children,
}: {
  hlava: ReactNode;
  testId: string;
  /** Třída `<details>`; výchozí je sekce kontroly lobby. */
  className?: string;
  otevreno: boolean;
  onPrepnout: (otevreno: boolean) => void;
  children: ReactNode;
}) {
  const telo = useRef<HTMLDivElement>(null);
  const rozjete = useRef<Animation | null>(null);
  const otevritAnimaci = useRef(false);
  const umiAnimovat = () =>
    typeof telo.current?.animate === "function" && !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useLayoutEffect(() => {
    if (!otevreno || !otevritAnimaci.current) return;
    otevritAnimaci.current = false;
    const el = telo.current;
    if (!el || !umiAnimovat()) return;
    rozjete.current?.cancel();
    el.style.overflow = "hidden";
    rozjete.current = el.animate([{ height: "0px", opacity: 0 }, { height: `${el.scrollHeight}px`, opacity: 1 }], {
      duration: SKLADANI_MS,
      easing: "ease",
    });
    rozjete.current.onfinish = () => {
      el.style.overflow = "";
      rozjete.current = null;
    };
  }, [otevreno]);
  const klik = (e: React.MouseEvent) => {
    e.preventDefault();
    if (rozjete.current) return;
    const el = telo.current;
    if (otevreno) {
      if (!el || !umiAnimovat()) {
        onPrepnout(false);
        return;
      }
      el.style.overflow = "hidden";
      rozjete.current = el.animate([{ height: `${el.scrollHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }], {
        duration: SKLADANI_MS,
        easing: "ease",
      });
      rozjete.current.onfinish = () => {
        el.style.overflow = "";
        rozjete.current = null;
        onPrepnout(false);
      };
      return;
    }
    otevritAnimaci.current = true;
    onPrepnout(true);
  };
  return (
    <details
      className={className}
      data-testid={testId}
      open={otevreno}
      onToggle={(e) => {
        // Přepnutí mimo naše kliknutí (třeba prohlížečem při hledání v textu).
        if (e.currentTarget.open !== otevreno && !rozjete.current) onPrepnout(e.currentTarget.open);
      }}
    >
      <summary onClick={klik}>{hlava}</summary>
      <div className="skladaci-telo" ref={telo}>
        {children}
      </div>
    </details>
  );
}
