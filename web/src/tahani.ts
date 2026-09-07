import { useRef, type DragEvent } from "react";
import type { Skupina } from "./skladani.js";

/**
 * Přetahování řádků v rámci jedné skupiny (vybraní, nebo nevybraní). Tažený
 * prvek se drží v refu, ne v dataTransfer — jsdom ho v testech nemá a pro
 * dvě skupiny na jedné stránce stejně stačí jeden společný ref.
 */
export function useTahani(presun: (skupina: Skupina, odId: string, naId: string) => void) {
  const tazeny = useRef<{ steamId: string; skupina: Skupina } | null>(null);

  return (skupina: Skupina, steamId: string) => ({
    draggable: true,
    onDragStart: () => {
      tazeny.current = { steamId, skupina };
    },
    onDragOver: (e: DragEvent) => {
      // Přetahovat jde jen v rámci skupiny; cizí tažení se nepřijme.
      if (tazeny.current?.skupina === skupina) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (tazeny.current?.skupina === skupina) presun(skupina, tazeny.current.steamId, steamId);
      tazeny.current = null;
    },
    onDragEnd: () => {
      tazeny.current = null;
    },
  });
}
