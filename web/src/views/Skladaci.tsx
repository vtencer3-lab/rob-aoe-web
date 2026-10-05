import type { ReactNode } from "react";
import { useSbalovani } from "../pohyb.js";

/**
 * Sbalovací blok nad `<details>` s plynulým rozbalením i sbalením (uživatel
 * 13. 9. 2026). Prohlížeč umí `<details>` jen skokem, tak se kliknutí na
 * `<summary>` zachytí: při otevření se `open` nastaví hned a tělo dojede
 * z nuly na svou výšku; při zavření tělo napřed sjede na nulu a `open` se
 * odebere až potom (`useSbalovani`, čas z `--prechod-skladani`). Bez Web
 * Animations (testovací DOM) nebo při `prefers-reduced-motion` se jen přepne.
 *
 * Šipku kreslí CSS (`details > summary::before`) a otáčí ji podle `open`;
 * aby se při zavírání otočila zpátky hned s tělem, a ne až po něm, nese
 * `<details>` po dobu sbalování `data-zavira`.
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
  const { telo, prepni, bezi, zavira } = useSbalovani<HTMLDivElement>(otevreno, onPrepnout);
  const klik = (e: React.MouseEvent) => {
    e.preventDefault();
    prepni();
  };
  return (
    <details
      className={className}
      data-testid={testId}
      data-zavira={zavira ? "" : undefined}
      open={otevreno}
      onToggle={(e) => {
        // Přepnutí mimo naše kliknutí (třeba prohlížečem při hledání v textu).
        if (e.currentTarget.open !== otevreno && !bezi()) onPrepnout(e.currentTarget.open);
      }}
    >
      <summary onClick={klik}>{hlava}</summary>
      <div className="skladaci-telo" ref={telo}>
        {children}
      </div>
    </details>
  );
}
