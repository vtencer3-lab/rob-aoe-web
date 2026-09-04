import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

// scripts/migrate.ts hledá SQL soubory na cestě odvozené od vlastního umístění
// (join(import.meta.dirname, "..", "database")). Ve vývoji to ukáže na
// skutečnou složku database/ vedle scripts/. Po sestavení ale migrate.ts
// skončí jako dist/scripts/migrate.js, takže stejný vzorec ukáže na
// dist/database — tam je potřeba mít SQL soubory zkopírované, jinak
// zkompilovaný migrátor v produkci nenajde žádné migrace.
const src = join(import.meta.dirname, "..", "database");
const dest = join(import.meta.dirname, "..", "dist", "database");

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`Zkopírováno database/ -> ${dest}`);
